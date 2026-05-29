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
	"github.com/cvlikhith/codesearch/ingestion/internal/domain"
)

type IngestionService struct {
	repoPath string
	repoName string
	embedder *embedder.Embedder
	repo     domain.ChunkRepository
	bm25     domain.BM25Index
	logger   *slog.Logger
}

func NewIngestionService(
	repoPath string,
	repoName string,
	embedder *embedder.Embedder,
	repo domain.ChunkRepository,
	bm25 domain.BM25Index,
	logger *slog.Logger,
) *IngestionService {
	return &IngestionService{
		repoPath: repoPath,
		repoName: repoName,
		embedder: embedder,
		repo:     repo,
		bm25:     bm25,
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
		id := chunker.ChunkID(pair.Child.FilePath, pair.Child.Name)
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
		}
		embedTexts[i] = embedText
	}

	codeVecs, err := s.embedder.Embed(ctx, embedTexts)
	if err != nil {
		return fmt.Errorf("embed code: %w", err)
	}

	docTexts := make([]string, len(pairs))
	for i, pair := range pairs {
		docTexts[i] = pair.Child.Docstring
		if docTexts[i] == "" {
			docTexts[i] = pair.Child.Signature
		}
	}

	docVecs, err := s.embedder.Embed(ctx, docTexts)
	if err != nil {
		return fmt.Errorf("embed docstrings: %w", err)
	}

	for i := range domainChunks {
		domainChunks[i].CodeVec = codeVecs[i]
		domainChunks[i].DocVec = docVecs[i]
	}

	if err := s.repo.Upsert(ctx, domainChunks); err != nil {
		return fmt.Errorf("upsert to qdrant: %w", err)
	}

	if err := s.bm25.Add(ctx, domainChunks); err != nil {
		s.logger.Warn("bm25 add failed", "error", err)
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
	s.logger.Info("deleted file from index", "path", filePath)
	return nil
}
