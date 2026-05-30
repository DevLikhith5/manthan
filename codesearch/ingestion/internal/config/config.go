package config

import (
	"github.com/spf13/viper"
)

type Config struct {
	QdrantURL            string `mapstructure:"QDRANT_URL"`
	RedisURL             string `mapstructure:"REDIS_URL"`
	EmbeddingServiceURL  string `mapstructure:"EMBEDDING_SERVICE_URL"`
	EmbeddingModel       string `mapstructure:"EMBEDDING_MODEL"`
	RepoPath             string `mapstructure:"REPO_PATH"`
	RepoName             string `mapstructure:"REPO_NAME"`
	QueueName            string `mapstructure:"QUEUE_NAME"`
	ConsumerGroup        string `mapstructure:"CONSUMER_GROUP"`
	WorkerCount          int    `mapstructure:"WORKER_COUNT"`
	PollIntervalSec      int    `mapstructure:"POLL_INTERVAL_SEC"`
	BM25IndexPath        string `mapstructure:"BM25_INDEX_PATH"`
	VectorDim            int    `mapstructure:"VECTOR_DIM"`
	QdrantCollectionName string `mapstructure:"QDRANT_COLLECTION_NAME"`
	Oneshot              bool   `mapstructure:"ONESHOT"`
	OneshotTimeoutSec    int    `mapstructure:"ONESHOT_TIMEOUT_SEC"`
	Neo4jURI             string `mapstructure:"NEO4J_URI"`
	Neo4jUser            string `mapstructure:"NEO4J_USER"`
	Neo4jPassword        string `mapstructure:"NEO4J_PASSWORD"`
	EnableGraph          bool   `mapstructure:"ENABLE_GRAPH"`
}

func Load() *Config {
	viper.AutomaticEnv()

	viper.SetDefault("QDRANT_URL", "localhost:6334")
	viper.SetDefault("REDIS_URL", "redis://localhost:6379")
	viper.SetDefault("EMBEDDING_SERVICE_URL", "http://localhost:8081")
	viper.SetDefault("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
	viper.SetDefault("REPO_PATH", "/repos/target")
	viper.SetDefault("QUEUE_NAME", "ingestion_queue")
	viper.SetDefault("CONSUMER_GROUP", "ingestion_workers")
	viper.SetDefault("WORKER_COUNT", 8)
	viper.SetDefault("POLL_INTERVAL_SEC", 30)
	viper.SetDefault("BM25_INDEX_PATH", "/data/bm25.pkl")
	viper.SetDefault("VECTOR_DIM", 384)
	viper.SetDefault("QDRANT_COLLECTION_NAME", "codebase")
	viper.SetDefault("ONESHOT", false)
	viper.SetDefault("ONESHOT_TIMEOUT_SEC", 120)
	viper.SetDefault("NEO4J_URI", "bolt://localhost:7687")
	viper.SetDefault("NEO4J_USER", "neo4j")
	viper.SetDefault("NEO4J_PASSWORD", "graphpassword")
	viper.SetDefault("ENABLE_GRAPH", false)

	return &Config{
		QdrantURL:            viper.GetString("QDRANT_URL"),
		RedisURL:             viper.GetString("REDIS_URL"),
		EmbeddingServiceURL:  viper.GetString("EMBEDDING_SERVICE_URL"),
		EmbeddingModel:       viper.GetString("EMBEDDING_MODEL"),
		RepoPath:             viper.GetString("REPO_PATH"),
		RepoName:             viper.GetString("REPO_NAME"),
		QueueName:            viper.GetString("QUEUE_NAME"),
		ConsumerGroup:        viper.GetString("CONSUMER_GROUP"),
		WorkerCount:          viper.GetInt("WORKER_COUNT"),
		PollIntervalSec:      viper.GetInt("POLL_INTERVAL_SEC"),
		BM25IndexPath:        viper.GetString("BM25_INDEX_PATH"),
		VectorDim:            viper.GetInt("VECTOR_DIM"),
		QdrantCollectionName: viper.GetString("QDRANT_COLLECTION_NAME"),
		Oneshot:              viper.GetBool("ONESHOT"),
		OneshotTimeoutSec:    viper.GetInt("ONESHOT_TIMEOUT_SEC"),
		Neo4jURI:             viper.GetString("NEO4J_URI"),
		Neo4jUser:            viper.GetString("NEO4J_USER"),
		Neo4jPassword:        viper.GetString("NEO4J_PASSWORD"),
		EnableGraph:          viper.GetBool("ENABLE_GRAPH"),
	}
}
