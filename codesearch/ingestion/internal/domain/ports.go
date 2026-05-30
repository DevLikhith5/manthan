package domain

import (
	"context"

	"github.com/cvlikhith/codesearch/ingestion/internal/adapter/graph"
)

type EmbedderPort interface {
	Embed(ctx context.Context, texts []string) ([][]float32, error)
}

type ChunkRepository interface {
	Upsert(ctx context.Context, chunks []Chunk) error
	Delete(ctx context.Context, filePath string) error
}

type QueuePublisher interface {
	Push(ctx context.Context, job Job) error
}

type BM25Index interface {
	Add(ctx context.Context, chunks []Chunk) error
	Remove(ctx context.Context, filePath string) error
	Persist() error
}

type GraphRepository interface {
	UpsertNodes(ctx context.Context, nodes []graph.Node) error
	UpsertEdges(ctx context.Context, edges []graph.Edge) error
	DeleteByFile(ctx context.Context, filePath string, repo string) error
	GetNeighbors(ctx context.Context, nodeID string, repo string) ([]graph.Node, []graph.Edge, error)
	GetCallGraph(ctx context.Context, name string, filePath string, depth int) ([]graph.Node, []graph.Edge, error)
	GetFileDependencyGraph(ctx context.Context, filePath string, repo string) ([]graph.Node, []graph.Edge, error)
}
