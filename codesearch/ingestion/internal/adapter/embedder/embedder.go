package embedder

import (
	"context"
)

type Embedder struct {
	client *HTTPClient
	cache  *EmbedCache
}

func New(embeddingServiceURL, model string, cache *EmbedCache) *Embedder {
	return &Embedder{
		client: NewHTTPClient(embeddingServiceURL, model),
		cache:  cache,
	}
}

func (e *Embedder) Embed(ctx context.Context, texts []string) ([][]float32, error) {
	return e.BatchEmbed(ctx, texts)
}

func (e *Embedder) BatchEmbed(ctx context.Context, texts []string) ([][]float32, error) {
	results := make([][]float32, len(texts))
	missIndices := []int{}
	missTexts := []string{}

	for i, text := range texts {
		if vec, ok := e.cache.Get(ctx, text); ok {
			results[i] = vec
		} else {
			missIndices = append(missIndices, i)
			missTexts = append(missTexts, text)
		}
	}

	if len(missTexts) == 0 {
		return results, nil
	}

	vecs, err := e.client.Embed(ctx, missTexts)
	if err != nil {
		return nil, err
	}

	for i, vec := range vecs {
		idx := missIndices[i]
		results[idx] = vec
		e.cache.Set(ctx, missTexts[i], vec)
	}

	return results, nil
}

func (e *Embedder) EmbedOne(ctx context.Context, text string) ([]float32, error) {
	vecs, err := e.Embed(ctx, []string{text})
	if err != nil {
		return nil, err
	}
	return vecs[0], nil
}
