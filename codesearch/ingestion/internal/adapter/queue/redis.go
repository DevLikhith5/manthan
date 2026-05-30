package queue

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/redis/go-redis/v9"

	"github.com/cvlikhith/codesearch/ingestion/internal/domain"
)

type RedisQueue struct {
	client      *redis.Client
	queueName   string
	consumerGrp string
}

func NewRedisQueue(client *redis.Client, queueName, consumerGroup string) *RedisQueue {
	return &RedisQueue{
		client:      client,
		queueName:   queueName,
		consumerGrp: consumerGroup,
	}
}

func (q *RedisQueue) EnsureGroup(ctx context.Context) error {
	err := q.client.XGroupCreateMkStream(ctx, q.queueName, q.consumerGrp, "0").Err()
	if err != nil && err.Error() != "BUSYGROUP Consumer Group name already exists" {
		return fmt.Errorf("create consumer group: %w", err)
	}
	return nil
}

func (q *RedisQueue) Push(ctx context.Context, job domain.Job) error {
	data, err := json.Marshal(job)
	if err != nil {
		return fmt.Errorf("marshal job: %w", err)
	}
	return q.client.XAdd(ctx, &redis.XAddArgs{
		Stream: q.queueName,
		Values: map[string]interface{}{
			"data": string(data),
		},
	}).Err()
}

type StreamJob struct {
	ID  string
	Job domain.Job
}

func (q *RedisQueue) Consume(ctx context.Context, count int) ([]StreamJob, error) {
	entries, err := q.client.XReadGroup(ctx, &redis.XReadGroupArgs{
		Group:    q.consumerGrp,
		Consumer: fmt.Sprintf("worker-%d", count),
		Streams:  []string{q.queueName, ">"},
		Count:    int64(count),
		Block:    -1,
	}).Result()
	if err != nil {
		if err == redis.Nil {
			return nil, nil
		}
		return nil, fmt.Errorf("xreadgroup: %w", err)
	}

	var jobs []StreamJob
	for _, stream := range entries {
		for _, msg := range stream.Messages {
			data, ok := msg.Values["data"].(string)
			if !ok {
				continue
			}
			var job domain.Job
			if err := json.Unmarshal([]byte(data), &job); err != nil {
				continue
			}
			jobs = append(jobs, StreamJob{ID: msg.ID, Job: job})
		}
	}
	return jobs, nil
}

func (q *RedisQueue) Ack(ctx context.Context, jobID string) error {
	return q.client.XAck(ctx, q.queueName, q.consumerGrp, jobID).Err()
}
