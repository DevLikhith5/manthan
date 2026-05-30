package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/cvlikhith/codesearch/ingestion/internal/adapter/embedder"
	graphAdapter "github.com/cvlikhith/codesearch/ingestion/internal/adapter/graph"
	"github.com/cvlikhith/codesearch/ingestion/internal/adapter/queue"
	"github.com/cvlikhith/codesearch/ingestion/internal/adapter/store"
	"github.com/cvlikhith/codesearch/ingestion/internal/config"
	"github.com/cvlikhith/codesearch/ingestion/internal/domain"
	"github.com/cvlikhith/codesearch/ingestion/internal/service"
	"github.com/cvlikhith/codesearch/ingestion/internal/worker"
)

func main() {
	cfg := config.Load()
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	redisOpts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		logger.Error("invalid redis url", "error", err)
		os.Exit(1)
	}
	redisClient := redis.NewClient(redisOpts)

	if err := redisClient.Ping(context.Background()).Err(); err != nil {
		logger.Error("redis connection failed", "error", err)
		os.Exit(1)
	}
	logger.Info("connected to redis")

	qdrantStore, err := store.NewQdrant(cfg.QdrantURL, cfg.QdrantCollectionName)
	if err != nil {
		logger.Error("qdrant connection failed", "error", err)
		os.Exit(1)
	}

	if err := qdrantStore.EnsureCollection(context.Background(), cfg.VectorDim); err != nil {
		logger.Error("failed to ensure qdrant collection", "error", err)
		os.Exit(1)
	}
	logger.Info("qdrant collection ready", "dim", cfg.VectorDim)

	embedCache := embedder.NewEmbedCache(redisClient, cfg.EmbeddingModel)
	embedClient := embedder.New(cfg.EmbeddingServiceURL, cfg.EmbeddingModel, embedCache)

	bm25Store := store.NewBM25(cfg.BM25IndexPath)

	var graphRepo domain.GraphRepository
	if cfg.EnableGraph {
		neo4jClient, err := graphAdapter.NewNeo4jClient(graphAdapter.Neo4jConfig{
			URI:      cfg.Neo4jURI,
			User:     cfg.Neo4jUser,
			Password: cfg.Neo4jPassword,
		}, logger)
		if err != nil {
			logger.Error("neo4j connection failed", "error", err)
		} else {
			if err := neo4jClient.EnsureIndexes(context.Background()); err != nil {
				logger.Warn("neo4j index creation failed", "error", err)
			}
			graphRepo = neo4jClient
			defer neo4jClient.Close(context.Background())
			logger.Info("neo4j connected", "uri", cfg.Neo4jURI)
		}
	}

	ingestionSvc := service.NewIngestionService(cfg.RepoPath, cfg.RepoName, embedClient, qdrantStore, bm25Store, graphRepo, logger)

	redisQueue := queue.NewRedisQueue(redisClient, cfg.QueueName, cfg.ConsumerGroup)
	if err := redisQueue.EnsureGroup(context.Background()); err != nil {
		logger.Error("failed to ensure consumer group", "error", err)
		os.Exit(1)
	}

	gitWatcher := queue.NewGitWatcher(cfg.RepoPath, redisQueue)

	pool := worker.NewPool(cfg.WorkerCount, redisQueue, ingestionSvc, logger)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	poolDone := make(chan struct{})
	go func() {
		pool.Run(ctx)
		close(poolDone)
	}()

	if cfg.Oneshot {
		logger.Info("oneshot mode: scanning repo once and exiting")
		count := gitWatcher.FullScan(ctx)
		logger.Info("full scan complete", "files", count)
		if count > 0 {
			pool.SetTotalJobs(count)
			if cfg.OneshotTimeoutSec > 0 {
				go func() {
					timer := time.NewTimer(time.Duration(cfg.OneshotTimeoutSec) * time.Second)
					defer timer.Stop()
					select {
					case <-timer.C:
						logger.Warn("oneshot timeout reached, forcing shutdown",
							"completed", pool.Completed(), "total", count)
						cancel()
					case <-poolDone:
					}
				}()
			} else {
				go func() {
					<-poolDone
				}()
			}
		} else {
			cancel()
		}

		<-poolDone

		if err := bm25Store.Persist(); err != nil {
			logger.Error("bm25 persist failed", "error", err)
		}
		logger.Info("oneshot complete")
		return
	}

	go gitWatcher.Run(ctx, time.Duration(cfg.PollIntervalSec)*time.Second)

	logger.Info("indexer started",
		"workers", cfg.WorkerCount,
		"repo", cfg.RepoPath,
		"poll_sec", cfg.PollIntervalSec,
	)

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGTERM, syscall.SIGINT)
	<-sig

	logger.Info("shutting down")
	cancel()

	if err := bm25Store.Persist(); err != nil {
		logger.Error("bm25 persist failed", "error", err)
	}
	logger.Info("shutdown complete")
}
