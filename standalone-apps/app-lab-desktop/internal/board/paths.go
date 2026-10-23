package board

import (
	"context"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"slices"
	"strings"
	"sync"
)

// The board owns the app filesystem: user apps live under the apps dir and the
// bundled examples under the orchestrator data dir. Where those actually are is
// the orchestrator's to say - it reports them at GET /v1/config - so ask it,
// and fall back to the defaults below when it cannot be reached.
const (
	// AppsRootDir is the default apps directory on the board
	// ($HOME/ArduinoApps for the `arduino` user).
	AppsRootDir = "/home/arduino/ArduinoApps"

	// dataRootDir is the default arduino-app-cli data directory. It holds the
	// bundled examples (<dataRootDir>/examples) and their assets.
	dataRootDir = "/var/lib/arduino-app-cli"

	appsDirEnv = "ARDUINO_APP_CLI__APPS_DIR"
	dataDirEnv = "ARDUINO_APP_CLI__DATA_DIR"
)

var (
	orchestratorConfigMu    sync.Mutex
	orchestratorConfigCache = map[string]*orchestratorConfig{}
)

// cachedOrchestratorConfig reads /v1/config once per orchestrator origin. Only a
// config that names at least one usable root is cached, so an orchestrator still
// coming up is asked again.
func cachedOrchestratorConfig(ctx context.Context, origin string) (*orchestratorConfig, error) {
	orchestratorConfigMu.Lock()
	cached, ok := orchestratorConfigCache[origin]
	orchestratorConfigMu.Unlock()
	if ok {
		return cached, nil
	}

	cfg, err := fetchOrchestratorConfig(ctx, origin)
	if err != nil {
		return nil, err
	}
	if len(reportedAppFileRoots(cfg)) > 0 {
		orchestratorConfigMu.Lock()
		orchestratorConfigCache[origin] = cfg
		orchestratorConfigMu.Unlock()
	}
	return cfg, nil
}

// AppFileRoots returns the directories that may legitimately hold app files:
// user apps, the orchestrator data dir and the bundled examples. Reads
// performed on behalf of the webview are confined to these roots so a crafted
// request cannot walk the rest of the filesystem.
//
// The dirs come from the board's own orchestrator, because they describe the
// board's filesystem: off-board this process shares neither that filesystem nor
// the environment that configures it, so its own environment says nothing about
// where the board keeps apps. Answers are cached per orchestrator origin, which
// is a tunnel port allocated per session - so a reconnect or a board switch
// re-reads them. Only successful reads are cached; while the orchestrator is
// still coming up we keep serving the defaults and retry.
func (b *Board) AppFileRoots(ctx context.Context) []string {
	origin, err := b.InferOrchestratorURL()
	if err != nil {
		return defaultAppFileRoots()
	}

	cfg, err := cachedOrchestratorConfig(ctx, origin)
	if err != nil {
		return defaultAppFileRoots()
	}

	roots := reportedAppFileRoots(cfg)
	if len(roots) == 0 {
		return defaultAppFileRoots()
	}
	return roots
}

// reportedAppFileRoots keeps the dirs the orchestrator named that can actually
// bound a read. A relative dir cannot be compared against an absolute request
// path, and "/" would make the confinement meaningless, so both are dropped
// rather than trusted - leaving the defaults to stand in.
func reportedAppFileRoots(cfg *orchestratorConfig) []string {
	roots := []string{}
	for _, dir := range []string{
		cfg.Directories.Apps,
		cfg.Directories.Data,
		cfg.Directories.Examples,
	} {
		clean := filepath.Clean(dir)
		if dir == "" || !filepath.IsAbs(clean) || clean == string(os.PathSeparator) {
			continue
		}
		roots = append(roots, clean)
	}
	return dedupe(roots)
}

// OwnAppFileRoots returns the app file roots of the board this process runs on:
// the apps dir and the data dir that holds the bundled examples. It answers
// without asking the orchestrator, from the same environment the orchestrator
// reads, so it is only meaningful when IsSBC.
func OwnAppFileRoots() []string {
	return defaultAppFileRoots()
}

func defaultAppFileRoots() []string {
	apps, data := AppsRootDir, dataRootDir

	// The arduino-app-cli environment variables configure the orchestrator, so
	// they only describe the dirs of the machine running it. That is this one
	// only when we are the board.
	if IsSBC() {
		apps = envOr(appsDirEnv, apps)
		data = envOr(dataDirEnv, data)
	}

	return dedupe([]string{apps, data})
}

func dedupe(dirs []string) []string {
	unique := make([]string, 0, len(dirs))
	for _, dir := range dirs {
		if !slices.Contains(unique, dir) {
			unique = append(unique, dir)
		}
	}
	return unique
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// IsWithinDir reports whether target resolves to a location inside dir.
func IsWithinDir(target, dir string) bool {
	cleanDir := filepath.Clean(dir)
	cleanTarget := filepath.Clean(target)
	return cleanTarget == cleanDir ||
		strings.HasPrefix(cleanTarget, cleanDir+string(os.PathSeparator))
}

// IsWithinAnyDir reports whether target resolves to a location inside any of dirs.
func IsWithinAnyDir(target string, dirs []string) bool {
	return slices.ContainsFunc(dirs, func(dir string) bool {
		return IsWithinDir(target, dir)
	})
}

// UserAppsDir returns the board's apps dir as its orchestrator reports it, from
// the same cached config as AppFileRoots. An unreachable orchestrator is an
// error, not the default: on a board with its own apps dir the default would
// make every user app read-only, and the checkout would keep that verdict.
func UserAppsDir(ctx context.Context, origin string) (string, error) {
	cfg, err := cachedOrchestratorConfig(ctx, origin)
	if err != nil {
		return "", fmt.Errorf("read the board's apps dir: %w", err)
	}
	// path.Clean("") is ".", which IsAbs rejects.
	dir := path.Clean(cfg.Directories.Apps)
	if !path.IsAbs(dir) || dir == "/" {
		return defaultUserAppsDir(), nil
	}
	return dir, nil
}

func defaultUserAppsDir() string {
	if IsSBC() {
		return envOr(appsDirEnv, AppsRootDir)
	}
	return AppsRootDir
}

// IsUserAppPath reports whether an app's board path is inside the user's apps
// dir. Built-in examples and installed releases live outside it, and only an app
// inside it may be written.
func IsUserAppPath(appPath, appsDir string) bool {
	// Board paths are POSIX whatever the host, so path, not filepath.
	return strings.HasPrefix(path.Clean(appPath), path.Clean(appsDir)+"/")
}
