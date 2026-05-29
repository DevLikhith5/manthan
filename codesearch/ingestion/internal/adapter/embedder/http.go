package embedder

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type HTTPClient struct {
	baseURL string
	model   string
	client  *http.Client
}

func NewHTTPClient(baseURL, model string) *HTTPClient {
	return &HTTPClient{
		baseURL: baseURL,
		model:   model,
		client: &http.Client{
			Timeout: 60 * time.Second,
		},
	}
}

type embedRequest struct {
	Texts []string `json:"texts"`
}

type embedResponse struct {
	Embeddings [][]float64 `json:"embeddings"`
	Dimension  int         `json:"dimension"`
	Model      string      `json:"model"`
}

func (c *HTTPClient) Embed(ctx context.Context, texts []string) ([][]float32, error) {
	body := embedRequest{Texts: texts}
	data, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/embed", bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http call: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("embedding service returned %d", resp.StatusCode)
	}

	var result embedResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	vecs := make([][]float32, len(result.Embeddings))
	for i, v := range result.Embeddings {
		vecs[i] = make([]float32, len(v))
		for j, f := range v {
			vecs[i][j] = float32(f)
		}
	}

	return vecs, nil
}
