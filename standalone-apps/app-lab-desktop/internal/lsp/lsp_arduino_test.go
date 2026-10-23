package lsp

import (
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"
	"time"
)

// writeCtags plants a ctags binary in the layout arduino-cli installs it under,
// and returns the data dir to hand to the functions under test.
func writeCtags(t *testing.T, content string, mode os.FileMode) (dataDir, ctagsPath string) {
	t.Helper()

	dataDir = t.TempDir()
	dir := filepath.Join(dataDir, "packages", "builtin", "tools", "ctags", "5.8-arduino11")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	ctagsPath = filepath.Join(dir, "ctags")
	if err := os.WriteFile(ctagsPath, []byte(content), mode); err != nil {
		t.Fatalf("write ctags: %v", err)
	}
	return dataDir, ctagsPath
}

// A ctags that runs is the only thing this check cares about, so a working one
// must not trigger a repair.
func TestCheckCtagsExecutableAcceptsRunnableBinary(t *testing.T) {
	dataDir, _ := writeCtags(t, "#!/bin/sh\necho 'Exuberant Ctags 5.8'\n", 0o755)

	if err := checkCtagsExecutable(dataDir); err != nil {
		t.Fatalf("checkCtagsExecutable() = %v, want nil", err)
	}
}

// The real failure is EBADARCH from an x86_64 binary with no Rosetta. We cannot
// plant one of those portably, but any un-exec-able file reaches the same branch.
func TestCheckCtagsExecutableRejectsUnrunnableBinary(t *testing.T) {
	dataDir, ctagsPath := writeCtags(t, "\x00\x01not a valid executable", 0o755)

	err := checkCtagsExecutable(dataDir)
	if err == nil {
		t.Fatal("checkCtagsExecutable() = nil, want an error")
	}
	// The path belongs in the message: it is the only clue in a support log as to
	// which installed tool needed replacing.
	if got := err.Error(); !strings.Contains(got, ctagsPath) {
		t.Fatalf("error %q does not name the offending binary %q", got, ctagsPath)
	}
}

// A non-zero exit means the binary ran, which is the entire question. Repairing on
// it would clobber a working ctags that merely dislikes --version.
func TestCheckCtagsExecutableAcceptsNonZeroExit(t *testing.T) {
	dataDir, _ := writeCtags(t, "#!/bin/sh\nexit 3\n", 0o755)

	if err := checkCtagsExecutable(dataDir); err != nil {
		t.Fatalf("checkCtagsExecutable() = %v, want nil for a non-zero exit", err)
	}
}

// Before the core is installed there is no ctags to test. Failing here would
// block the very first launch, so absence has to pass.
func TestCheckCtagsExecutableSkipsWhenMissing(t *testing.T) {
	dataDir := t.TempDir()

	if err := checkCtagsExecutable(dataDir); err != nil {
		t.Fatalf("checkCtagsExecutable() = %v, want nil when ctags is absent", err)
	}
}

// The repair has to leave a binary that actually runs, and has to survive the
// destination being the currently-executing file (hence the rename dance).
func TestInstallNativeCtagsReplacesUnrunnableBinary(t *testing.T) {
	dataDir, ctagsPath := writeCtags(t, "\x00\x01not a valid executable", 0o755)

	// Stand in for the bundled arm64 binary.
	src := filepath.Join(t.TempDir(), "ctags")
	if err := os.WriteFile(src, []byte("#!/bin/sh\necho 'Exuberant Ctags 5.8'\n"), 0o755); err != nil {
		t.Fatalf("write bundled ctags: %v", err)
	}

	if err := installNativeCtags(dataDir, src); err != nil {
		t.Fatalf("installNativeCtags() = %v, want nil", err)
	}

	// The replacement must be in place *and* runnable, which is what the caller
	// re-checks before letting the language server start.
	if err := checkCtagsExecutable(dataDir); err != nil {
		t.Fatalf("ctags still not executable after repair: %v", err)
	}
	info, err := os.Stat(ctagsPath)
	if err != nil {
		t.Fatalf("stat repaired ctags: %v", err)
	}
	if info.Mode().Perm()&0o111 == 0 {
		t.Fatalf("repaired ctags is not executable, mode = %v", info.Mode().Perm())
	}
	// No staging file left behind.
	if _, err := os.Stat(ctagsPath + ".arm64.tmp"); !os.IsNotExist(err) {
		t.Fatalf("staging file was not cleaned up: %v", err)
	}
}

// Without a bundled binary there is nothing to repair with; the error has to say
// so rather than reporting a successful no-op.
func TestInstallNativeCtagsFailsWithoutBundledBinary(t *testing.T) {
	dataDir, _ := writeCtags(t, "\x00\x01not a valid executable", 0o755)

	src := filepath.Join(t.TempDir(), "does-not-exist")
	if err := installNativeCtags(dataDir, src); err == nil {
		t.Fatal("installNativeCtags() = nil, want an error when nothing is bundled")
	}
}

// A clangd that answers must pass: rejecting one would block the Arduino LSP
// outright, and this check runs on every Start.
func TestVerifyClangdExecutableAcceptsAWorkingClangd(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("the stand-in is a /bin/sh script")
	}

	clangd := writeFakeTool(t, "clangd", "#!/bin/sh\necho 'clangd version 22.1.8'\n")

	if err := verifyClangdExecutableAt(clangd, toolVerifyTimeout); err != nil {
		t.Fatalf("verifyClangdExecutableAt() = %v, want nil", err)
	}
}

// The loader failure this check was written for kills clangd ~25ms after spawn,
// but a binary held by an antivirus hangs instead. On a context.Background() wait
// that parked Start forever, and Start is called from restartLSP with the send
// mutex held — so the hang reached the editor. It reaches the board too: an SBC
// runs this same bundled clangd.
func TestVerifyClangdExecutableTimesOutOnAHangingClangd(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("the stand-in is a /bin/sh script")
	}

	// Touches a file only if it outlives the deadline, which is how the child
	// being killed rather than merely abandoned is observable from here.
	survived := filepath.Join(t.TempDir(), "survived")
	clangd := writeFakeTool(t, "clangd", "#!/bin/sh\nsleep 10\ntouch "+survived+"\n")

	start := time.Now()
	err := verifyClangdExecutableAt(clangd, 300*time.Millisecond)
	elapsed := time.Since(start)

	if err == nil {
		t.Fatal("verifyClangdExecutableAt() = nil, want a timeout")
	}
	if elapsed > 5*time.Second {
		t.Errorf("waited %s: the deadline was not enforced", elapsed)
	}
	// "signal: killed" is what the process reports; the message has to say what
	// actually happened, since this is all a support log will have.
	if !strings.Contains(err.Error(), "timed out") {
		t.Errorf("error does not report a timeout: %v", err)
	}
	if !strings.Contains(err.Error(), clangd) {
		t.Errorf("error %q does not name the binary %q", err, clangd)
	}

	time.Sleep(600 * time.Millisecond)
	if _, statErr := os.Stat(survived); statErr == nil {
		t.Error("the hanging child kept running after the deadline")
	}
}

// A non-zero exit is not tolerated here, unlike the ctags check: a loader failure
// is reported *as* an exit status, which is the case this exists for.
func TestVerifyClangdExecutableRejectsANonZeroExit(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("the stand-in is a /bin/sh script")
	}

	clangd := writeFakeTool(t, "clangd", "#!/bin/sh\nexit 1\n")

	if err := verifyClangdExecutableAt(clangd, toolVerifyTimeout); err == nil {
		t.Fatal("verifyClangdExecutableAt() = nil, want an error for a non-zero exit")
	}
}

// writeFakeArduinoCliConfig plants a script that answers `config dump --json` from a
// urls file and rewrites that file on `config remove`, so the removal can be
// tested without an arduino-cli install. Returns the script path and the urls
// file, which holds one URL per line.
func writeFakeArduinoCliConfig(t *testing.T, urls []string) (cliPath, urlsPath string) {
	t.Helper()

	dir := t.TempDir()
	urlsPath = filepath.Join(dir, "urls")
	body := ""
	if len(urls) > 0 {
		body = strings.Join(urls, "\n") + "\n"
	}
	if err := os.WriteFile(urlsPath, []byte(body), 0o644); err != nil {
		t.Fatalf("write urls: %v", err)
	}

	script := `#!/bin/sh
URLS="` + urlsPath + `"
case "$1 $2" in
  "config dump")
    printf '{"config":{"board_manager":{"additional_urls":['
    sep=""
    while IFS= read -r u; do
      [ -z "$u" ] && continue
      printf '%s"%s"' "$sep" "$u"
      sep=","
    done < "$URLS"
    printf ']}}}'
    ;;
  "config remove")
    grep -v -x -F "$4" "$URLS" > "$URLS.new"
    mv "$URLS.new" "$URLS"
    ;;
  *)
    echo "unexpected: $*" >&2
    exit 1
    ;;
esac
`
	cliPath = filepath.Join(dir, "arduino-cli")
	if err := os.WriteFile(cliPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake arduino-cli: %v", err)
	}
	return cliPath, urlsPath
}

// readURLs returns what the fake arduino-cli's config now holds.
func readURLs(t *testing.T, urlsPath string) []string {
	t.Helper()

	raw, err := os.ReadFile(urlsPath)
	if err != nil {
		t.Fatalf("read urls: %v", err)
	}
	var urls []string
	for _, line := range strings.Split(string(raw), "\n") {
		if line != "" {
			urls = append(urls, line)
		}
	}
	return urls
}

// An install that registered the zephyr staging index for ventunoq must have it
// removed: the index publishes pre-releases that decide "latest" for every
// arduino:zephyr board. URLs the user added stay.
func TestRemoveStaleArduinoCliAdditionalURLsDropsOnlyOurs(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("the stand-in is a /bin/sh script")
	}

	userURL := "https://example.com/package_user_index.json"
	cliPath, urlsPath := writeFakeArduinoCliConfig(t, []string{staleIndexURLs[0], userURL})

	if err := removeStaleArduinoCliAdditionalURLs(cliPath, filepath.Join(t.TempDir(), "arduino-cli.yaml")); err != nil {
		t.Fatalf("removeStaleArduinoCliAdditionalURLs() = %v, want nil", err)
	}
	if got := readURLs(t, urlsPath); len(got) != 1 || got[0] != userURL {
		t.Fatalf("additional_urls = %v, want only %q", got, userURL)
	}
}

// writeFakeArduinoCli plants a script that records each invocation's arguments,
// one line per call, and exits with the given status. Returns the script path
// and the log path.
func writeFakeArduinoCli(t *testing.T, exitCode int) (cliPath, logPath string) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("the fake arduino-cli is a shell script")
	}

	dir := t.TempDir()
	logPath = filepath.Join(dir, "calls.log")
	cliPath = filepath.Join(dir, "arduino-cli")
	script := "#!/bin/sh\necho \"$@\" >> '" + logPath + "'\nexit " + strconv.Itoa(exitCode) + "\n"
	if err := os.WriteFile(cliPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake arduino-cli: %v", err)
	}
	return cliPath, logPath
}

// countUpdateIndexCalls returns how often the fake arduino-cli was asked to
// update the core index.
func countUpdateIndexCalls(t *testing.T, logPath string) int {
	t.Helper()
	data, err := os.ReadFile(logPath)
	if os.IsNotExist(err) {
		return 0
	}
	if err != nil {
		t.Fatalf("read call log: %v", err)
	}
	n := 0
	for _, line := range strings.Split(strings.TrimSpace(string(data)), "\n") {
		if strings.HasPrefix(line, "core update-index ") {
			n++
		}
	}
	return n
}

// The config file is persistent, so the index must be fetched on the first
// install call of a launch; later calls in the same launch reuse it.
func TestRefreshArduinoCliCoreIndexRunsOncePerLaunch(t *testing.T) {
	cliPath, logPath := writeFakeArduinoCli(t, 0)
	h := &LSPHandler{}

	for i := 0; i < 3; i++ {
		h.refreshArduinoCliCoreIndex(cliPath, "cfg.yaml")
	}
	if got := countUpdateIndexCalls(t, logPath); got != 1 {
		t.Fatalf("update-index ran %d times, want 1", got)
	}
}

// An offline host keeps the cached index: the per-launch refresh is not fatal,
// and it is not retried in the same launch, so a failing fetch cannot stall
// every language-server start.
func TestRefreshArduinoCliCoreIndexToleratesOfflineOncePerLaunch(t *testing.T) {
	cliPath, logPath := writeFakeArduinoCli(t, 1)
	h := &LSPHandler{}

	for i := 0; i < 2; i++ {
		h.refreshArduinoCliCoreIndex(cliPath, "cfg.yaml")
	}
	if got := countUpdateIndexCalls(t, logPath); got != 1 {
		t.Fatalf("update-index ran %d times, want 1", got)
	}
}

// writeHangingArduinoCli plants a script that sleeps past any test timeout, so
// a caller without a deadline never returns.
func writeHangingArduinoCli(t *testing.T) string {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("the fake arduino-cli is a shell script")
	}

	cliPath := filepath.Join(t.TempDir(), "arduino-cli")
	if err := os.WriteFile(cliPath, []byte("#!/bin/sh\nsleep 300\n"), 0o755); err != nil {
		t.Fatalf("write hanging arduino-cli: %v", err)
	}
	return cliPath
}

// A firewall that drops packets makes the fetch hang, so the per-launch
// refresh is time-boxed and the language server start continues without it.
func TestRefreshArduinoCliCoreIndexGivesUpOnAHangingFetch(t *testing.T) {
	cliPath := writeHangingArduinoCli(t)
	h := &LSPHandler{}

	prev := coreIndexRefreshTimeout
	coreIndexRefreshTimeout = 1 * time.Second
	t.Cleanup(func() { coreIndexRefreshTimeout = prev })

	start := time.Now()
	h.refreshArduinoCliCoreIndex(cliPath, "cfg.yaml")
	// The script sleeps for 300s. Anything near that means the deadline did not
	// reach the process.
	if elapsed := time.Since(start); elapsed > 30*time.Second {
		t.Fatalf("refreshArduinoCliCoreIndex() took %s, want it to give up at the timeout", elapsed)
	}
}
