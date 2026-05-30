package worker

import (
	"context"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"github.com/cvlikhith/codesearch/ingestion/internal/adapter/queue"
	"github.com/cvlikhith/codesearch/ingestion/internal/service"
)

type Pool struct {
	numWorkers   int
	queue        *queue.RedisQueue
	ingestion    *service.IngestionService
	logger       *slog.Logger
	totalJobs    atomic.Int64
	completed    atomic.Int64
	doneCh       chan struct{}
	progressCh   chan struct{}
	closeOnce    sync.Once
	cancel       context.CancelFunc
}

func NewPool(
	numWorkers int,
	queue *queue.RedisQueue,
	ingestion *service.IngestionService,
	logger *slog.Logger,
) *Pool {
	return &Pool{
		numWorkers: numWorkers,
		queue:      queue,
		ingestion:  ingestion,
		logger:     logger,
		doneCh:     make(chan struct{}),
	}
}

func (p *Pool) SetTotalJobs(n int) {
	p.totalJobs.Store(int64(n))
	if n == 0 {
		p.closeOnce.Do(func() { close(p.doneCh) })
	}
}

func (p *Pool) Done() <-chan struct{} {
	return p.doneCh
}

func (p *Pool) Completed() int64 {
	return p.completed.Load()
}

func (p *Pool) Run(ctx context.Context) {
	ctx, cancel := context.WithCancel(ctx)
	p.cancel = cancel
	for i := 0; i < p.numWorkers; i++ {
		go p.runWorker(ctx, i)
	}

	select {
	case <-ctx.Done():
	case <-p.doneCh:
		cancel()
	}
}

func (p *Pool) runWorker(ctx context.Context, workerID int) {
	logger := p.logger.With("worker", workerID)
	logger.Info("worker started")

	for {
		select {
		case <-ctx.Done():
			logger.Info("worker shutting down")
			return
		default:
		}

		jobs, err := p.queue.Consume(ctx, 1)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			logger.Error("consume error", "error", err)
			time.Sleep(time.Second)
			continue
		}

		if len(jobs) == 0 {
			time.Sleep(500 * time.Millisecond)
			continue
		}

		for _, sj := range jobs {
			job := sj.Job
			logger.Info("processing job", "file", job.FilePath, "change", job.ChangeType)

			var processErr error
			switch job.ChangeType {
			case "D":
				processErr = p.ingestion.DeleteFile(ctx, job.FilePath)
			default:
				processErr = p.ingestion.ProcessFile(ctx, job.FilePath)
			}

			if processErr != nil {
				logger.Error("job failed", "file", job.FilePath, "error", processErr)
			}

			if err := p.queue.Ack(ctx, sj.ID); err != nil {
				logger.Error("ack failed", "id", sj.ID, "error", err)
			}

			if total := p.totalJobs.Load(); total > 0 {
				done := p.completed.Add(1)
				if done >= total {
					p.closeOnce.Do(func() { close(p.doneCh) })
					return
				}
			}
		}
	}
}
