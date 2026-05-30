package service

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"

	"github.com/cvlikhith/codesearch/ingestion/internal/adapter/ast"
	"github.com/cvlikhith/codesearch/ingestion/internal/adapter/chunker"
	"github.com/cvlikhith/codesearch/ingestion/internal/adapter/embedder"
	"github.com/cvlikhith/codesearch/ingestion/internal/adapter/graph"
	"github.com/cvlikhith/codesearch/ingestion/internal/domain"
)

type IngestionService struct {
	repoPath string
	repoName string
	embedder *embedder.Embedder
	repo     domain.ChunkRepository
	bm25     domain.BM25Index
	graph    domain.GraphRepository
	logger   *slog.Logger
}

func NewIngestionService(
	repoPath string,
	repoName string,
	embedder *embedder.Embedder,
	repo domain.ChunkRepository,
	bm25 domain.BM25Index,
	graphRepo domain.GraphRepository,
	logger *slog.Logger,
) *IngestionService {
	return &IngestionService{
		repoPath: repoPath,
		repoName: repoName,
		embedder: embedder,
		repo:     repo,
		bm25:     bm25,
		graph:    graphRepo,
		logger:   logger,
	}
}

func (s *IngestionService) ProcessFile(ctx context.Context, filePath string) error {
	fullPath := filepath.Join(s.repoPath, filePath)
	content, err := os.ReadFile(fullPath)
	if err != nil {
		return fmt.Errorf("read file %s: %w", fullPath, err)
	}

	chunks, parseErr := ast.Parse(filePath, content)
	if parseErr != nil {
		return fmt.Errorf("parse %s: %w", filePath, parseErr)
	}
	if len(chunks) == 0 {
		return nil
	}

	s.logger.Info("parsed file", "path", filePath, "chunks", len(chunks))

	pairs := chunker.SplitIntoPairs(chunks)

	domainChunks := make([]domain.Chunk, len(pairs))
	embedTexts := make([]string, len(pairs))

	for i, pair := range pairs {
		id := chunker.ChunkID(pair.Child.FilePath, pair.Child.Name, pair.Child.StartLine, pair.Child.EndLine, pair.Child.ParentClass)
		embedText := chunker.BuildEmbedText(pair.Child)

		domainChunks[i] = domain.Chunk{
			ID:          id,
			Content:     pair.Parent.Content,
			Signature:   pair.Child.Signature,
			Docstring:   pair.Child.Docstring,
			EmbedText:   embedText,
			Name:        pair.Child.Name,
			Kind:        pair.Child.Kind,
			ParentClass: pair.Child.ParentClass,
			FilePath:    pair.Child.FilePath,
			Language:    pair.Child.Language,
			StartLine:   pair.Child.StartLine,
			EndLine:     pair.Child.EndLine,
			Imports:     pair.Child.Imports,
			Repo:        s.repoName,
			Calls:       convertCallSites(pair.Child.Calls),
			Extends:     pair.Child.Extends,
			Implements:  pair.Child.Implements,
			Decorators:  convertDecorators(pair.Child.Decorators),
			IsExported:  pair.Child.IsExported,
			Package:     pair.Child.Package,
		}
		embedTexts[i] = embedText
	}

	docTexts := make([]string, len(pairs))
	for i, pair := range pairs {
		docTexts[i] = pair.Child.Docstring
		if docTexts[i] == "" {
			docTexts[i] = pair.Child.Signature
		}
	}

	allTexts := make([]string, 0, len(embedTexts)+len(docTexts))
	allTexts = append(allTexts, embedTexts...)
	allTexts = append(allTexts, docTexts...)

	allVecs, err := s.embedder.Embed(ctx, allTexts)
	if err != nil {
		return fmt.Errorf("embed: %w", err)
	}

	n := len(pairs)
	for i := range domainChunks {
		domainChunks[i].CodeVec = allVecs[i]
		domainChunks[i].DocVec = allVecs[i+n]
	}

	if err := s.repo.Upsert(ctx, domainChunks); err != nil {
		return fmt.Errorf("upsert to qdrant: %w", err)
	}

	if err := s.bm25.Add(ctx, domainChunks); err != nil {
		s.logger.Warn("bm25 add failed", "error", err)
	}

	if s.graph != nil {
		nodes, edges := graph.BuildGraphFromChunks(chunks, s.repoName)
		if err := s.graph.UpsertNodes(ctx, nodes); err != nil {
			s.logger.Warn("graph upsert nodes failed", "error", err)
		}
		if err := s.graph.UpsertEdges(ctx, edges); err != nil {
			s.logger.Warn("graph upsert edges failed", "error", err)
		}
	}

	s.logger.Info("indexed file", "path", filePath, "chunks", len(domainChunks))
	return nil
}

func (s *IngestionService) DeleteFile(ctx context.Context, filePath string) error {
	if err := s.repo.Delete(ctx, filePath); err != nil {
		return fmt.Errorf("delete from qdrant: %w", err)
	}
	if err := s.bm25.Remove(ctx, filePath); err != nil {
		s.logger.Warn("bm25 remove failed", "error", err)
	}
	if s.graph != nil {
		if err := s.graph.DeleteByFile(ctx, filePath, s.repoName); err != nil {
			s.logger.Warn("graph delete failed", "error", err)
		}
	}
	s.logger.Info("deleted file from index", "path", filePath)
	return nil
}

func convertCallSites(calls []ast.CallSite) []domain.CallSite {
	if calls == nil {
		return nil
	}
	out := make([]domain.CallSite, len(calls))
	for i, c := range calls {
		out[i] = domain.CallSite{Name: c.Name, Qualifier: c.Qualifier, Line: c.Line}
	}
	return out
}

func convertDecorators(decs []ast.Decorator) []domain.Decorator {
	if decs == nil {
		return nil
	}
	out := make([]domain.Decorator, len(decs))
	for i, d := range decs {
		out[i] = domain.Decorator{Name: d.Name, Module: d.Module, Arguments: d.Arguments}
	}
	return out
}
