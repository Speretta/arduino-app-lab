package boardmcp

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const (
	// modelInstallHandoffWait bounds the wait for a fast download, so most finish inside the call with no follow-up.
	modelInstallHandoffWait = 45 * time.Second
	// modelInstallCap bounds the detached download: an hour covers the largest model (~750 MB) down to ~1.7 Mbit/s.
	modelInstallCap = 60 * time.Minute
)

type modelInstall struct {
	done chan struct{}

	mu         sync.Mutex
	firstAt    time.Time // rate is measured from the first byte, not from the connect that precedes it
	firstBytes int64
	current    int64
	total      int64
	failure    string
}

// ModelInstaller keeps one download per model id, for the whole process: a second request for a model wipes its partial and stalls the first.
type ModelInstaller struct {
	mu  sync.Mutex
	run map[string]*modelInstall
}

func NewModelInstaller() *ModelInstaller {
	return &ModelInstaller{run: map[string]*modelInstall{}}
}

// start joins the download in flight for id or launches one; a finished run is kept so models_wait_installed can report it.
func (m *ModelInstaller) start(access BoardAccess, id string) (run *modelInstall, joined bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if r, ok := m.run[id]; ok && !r.ended() {
		return r, true
	}
	r := &modelInstall{done: make(chan struct{})}
	m.run[id] = r
	go r.fetch(access, id)
	return r, false
}

func (m *ModelInstaller) lookup(id string) *modelInstall {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.run[id]
}

// fetch holds the board's connection for the whole download on its own context: the board kills it if we disconnect.
func (r *modelInstall) fetch(access BoardAccess, id string) {
	ctx, cancel := context.WithTimeout(context.Background(), modelInstallCap)
	defer cancel()
	failure, err := orchestratorStream(ctx, access, "/v1/models/"+url.PathEscape(id), r.progress)
	if err != nil {
		failure = err.Error()
	}
	r.mu.Lock()
	r.failure = failure
	r.mu.Unlock()
	close(r.done)
}

func (r *modelInstall) progress(current, total int64) {
	r.mu.Lock()
	if r.firstAt.IsZero() && current > 0 {
		r.firstAt, r.firstBytes = time.Now(), current
	}
	r.current, r.total = current, total
	r.mu.Unlock()
}

// eta estimates the time left from the rate since the first byte; withheld under 10%, where the ramp-up makes it wildly pessimistic.
func (r *modelInstall) eta() (time.Duration, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	moved, elapsed := r.current-r.firstBytes, time.Since(r.firstAt)
	if r.total <= 0 || r.current*10 < r.total || r.firstAt.IsZero() || moved <= 0 || elapsed <= 0 {
		return 0, false
	}
	return time.Duration(float64(elapsed) * float64(r.total-r.current) / float64(moved)), true
}

func (r *modelInstall) snapshot() (current, total int64, failure string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.current, r.total, r.failure
}

func (r *modelInstall) ended() bool {
	select {
	case <-r.done:
		return true
	default:
		return false
	}
}

// progressSuffix renders " — 27 MB of 722 MB (3%), about 8 min left"; the ETA stops the agent reading a slow download as a hang.
func progressSuffix(run *modelInstall) string {
	current, total, _ := run.snapshot()
	if total <= 0 {
		return ""
	}
	out := fmt.Sprintf(" — %d MB of %d MB (%d%%)", current/1_000_000, total/1_000_000, current*100/total)
	if left, ok := run.eta(); ok && left > 0 {
		out += fmt.Sprintf(", about %s left", left.Round(time.Minute/2))
	}
	return out
}

func installOutcome(ctx context.Context, access BoardAccess, id string, run *modelInstall) (*mcp.CallToolResult, error) {
	installed, readErr := modelIsInstalled(ctx, access, id)
	if readErr == nil && installed {
		return textResult(fmt.Sprintf("Installed model %q on the board. A brick already configured with it picks it up on the app's next start.", id)), nil
	}
	// Offered only when the model reads back: retrying is pointless for an id the board does not have at all.
	retry := ""
	if readErr == nil {
		retry = " The partial download was discarded; call models_install again to start over."
	}
	// The run's own failure comes first: a bad id 404s on both the download and the re-read.
	if _, _, failure := run.snapshot(); failure != "" {
		return nil, fmt.Errorf("install failed: %s.%s", strings.TrimRight(strings.TrimSpace(failure), "."), retry)
	}
	if readErr != nil {
		return nil, fmt.Errorf("install may not have completed (could not re-read the model): %w", readErr)
	}
	return nil, fmt.Errorf("install did not complete: the board still reports %q as not installed.%s", id, retry)
}
