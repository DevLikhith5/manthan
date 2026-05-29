package domain

import "context"

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
