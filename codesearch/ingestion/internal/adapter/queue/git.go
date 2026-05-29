package queue

import (
	"context"
	"os/exec"
	"strings"
	"time"

	"github.com/cvlikhith/codesearch/ingestion/internal/domain"
)

type GitWatcher struct {
	repoPath string
	queue    *RedisQueue
	lastSHA  string
}

func NewGitWatcher(repoPath string, queue *RedisQueue) *GitWatcher {
	return &GitWatcher{
		repoPath: repoPath,
		queue:    queue,
	}
}

func (w *GitWatcher) Run(ctx context.Context, pollInterval time.Duration) {
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			w.poll(ctx)
		}
	}
}

func (w *GitWatcher) poll(ctx context.Context) {
	currentSHA := w.getHEAD()
	if currentSHA == "" {
		return
	}

	// First poll: full scan all tracked files
	if w.lastSHA == "" {
		w.lastSHA = currentSHA
		w.FullScan(ctx)
		return
	}

	if currentSHA == w.lastSHA {
		return
	}

	changed := w.diff(w.lastSHA, currentSHA)
	for path, changeType := range changed {
		w.queue.Push(ctx, domain.Job{
			FilePath:   path,
			ChangeType: domain.ChangeType(changeType),
			CommitSHA:  currentSHA,
		})
	}
	w.lastSHA = currentSHA
}

// FullScan pushes all tracked files as new jobs and returns the count
func (w *GitWatcher) FullScan(ctx context.Context) int {
	cmd := exec.Command("git", "-C", w.repoPath, "ls-files")
	out, err := cmd.Output()
	if err != nil {
		return 0
	}
	count := 0
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		w.queue.Push(ctx, domain.Job{
			FilePath:   line,
			ChangeType: domain.ChangeTypeAdded,
			CommitSHA:  w.lastSHA,
		})
		count++
	}
	return count
}

func (w *GitWatcher) diff(from, to string) map[string]string {
	cmd := exec.Command("git", "-C", w.repoPath, "diff", "--name-status", from, to)
	out, err := cmd.Output()
	if err != nil {
		return nil
	}
	result := map[string]string{}
	for _, line := range strings.Split(string(out), "\n") {
		parts := strings.Fields(line)
		if len(parts) >= 2 {
			result[parts[1]] = parts[0]
		}
	}
	return result
}

func (w *GitWatcher) getHEAD() string {
	cmd := exec.Command("git", "-C", w.repoPath, "rev-parse", "HEAD")
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}
