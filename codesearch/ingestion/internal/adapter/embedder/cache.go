package embedder

import (
	"context"
	"crypto/md5"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

const cacheTTL = 7 * 24 * time.Hour

type EmbedCache struct {
	redis *redis.Client
	model string
}

func NewEmbedCache(redisClient *redis.Client, model string) *EmbedCache {
	return &EmbedCache{
		redis: redisClient,
		model: model,
	}
}

func (c *EmbedCache) cacheKey(text string) string {
	hash := md5.Sum([]byte(text + c.model))
	return fmt.Sprintf("emb:%x", hash)
}

func (c *EmbedCache) Get(ctx context.Context, text string) ([]float32, bool) {
	val, err := c.redis.Get(ctx, c.cacheKey(text)).Bytes()
	if err != nil {
		return nil, false
	}
	var vec []float32
	if err := json.Unmarshal(val, &vec); err != nil {
		return nil, false
	}
	return vec, true
}

func (c *EmbedCache) Set(ctx context.Context, text string, vec []float32) {
	data, _ := json.Marshal(vec)
	c.redis.Set(ctx, c.cacheKey(text), data, cacheTTL)
}

func (c *EmbedCache) Delete(ctx context.Context, text string) {
	c.redis.Del(ctx, c.cacheKey(text))
}
