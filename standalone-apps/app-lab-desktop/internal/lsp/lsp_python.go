package lsp

import (
	"archive/zip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"maps"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// defaultPythonVersion is the Python of the app container runtime, used for the
// analysis when the app-bricks wheel does not state it (see pythonAnalysisRules).
const defaultPythonVersion = "3.13"
const pyrightConfigFileName = "pyrightconfig.json"

// pythonDirName is the app subfolder holding the Python sources, the counterpart
// of sketchDirName for Arduino: an app's entrypoint is <app>/python/main.py.
const pythonDirName = "python"

// pythonVenvName is the stub virtual environment's directory name under
// GetLspWorkspacePythonVenvBase (see ensurePythonVenvStub).
const pythonVenvName = "applab"

const (
	boardVersionTimeout  = 30 * time.Second
	wheelDownloadTimeout = 30 * time.Second
)

func getPyrightConfigPath() string {
	return filepath.Join(getLspWorkspacePythonConfigDir(), pyrightConfigFileName)
}

// appBricksWheelURLs returns the release asset URLs to try, in order, for the
// app-bricks-py wheel of a version.
//
// app-bricks-py tags its releases bricks/<version> since 0.13.0; earlier releases
// are tagged release/<version>, and the assets of those tags are not republished.
// With the legacy scheme alone a board on a 0.13 runtime found no wheel (404), so
// the stubs fell back to an older release, or to nothing, and every app-bricks
// symbol read as undefined or stale in the editor.
func appBricksWheelURLs(version string) []string {
	asset := fmt.Sprintf("arduino_app_bricks-%s-py3-none-any.whl", version)
	return []string{
		fmt.Sprintf("https://github.com/arduino/app-bricks-py/releases/download/bricks/%s/%s", version, asset),
		fmt.Sprintf("https://github.com/arduino/app-bricks-py/releases/download/release/%s/%s", version, asset),
	}
}

// wheelURLsFor is indirected through a variable so a test can serve the wheel
// locally. The download failing is the case that used to destroy working stubs, and
// it cannot be exercised against the real release URLs.
var wheelURLsFor = appBricksWheelURLs

// ensurePythonStubs provisions the app-bricks type stubs for the connected board's
// runtime and returns the directory to hand basedpyright as extraPaths, or "" when
// no usable stubs exist.
//
// Stubs live in a per-version directory under python-stubs/, published by renaming a
// fully extracted staging directory into place and vouched for by a .ready file
// written last. Nothing is ever mutated where a running basedpyright can see it,
// which closes two ways this reached a tester as "app bricks stopped working":
//
//   - The previous layout deleted the single stubs directory *before* fetching the
//     wheel, so a network blip or a timeout left extraPaths pointing at an empty
//     directory. Silently, and until the next server start.
//   - On Windows os.RemoveAll fails on open handles, and pyright watches its search
//     paths, so that delete could half-finish against a running server and leave a
//     partial directory indistinguishable from a provisioned one.
//
// Every bail-out falls back to the newest complete directory an earlier run left
// behind: stale stubs beat no stubs, and a version the board no longer runs is far
// closer to right than nothing.
func (h *LSPHandler) ensurePythonStubs() string {
	ctx := h.ctxHolder.Get()

	// Held across the board call and the download so two servers starting together
	// cannot both extract. Both would succeed — the publish is atomic — but one
	// would do its work for nothing.
	h.ensurePythonStubsMu.Lock()
	defer h.ensurePythonStubsMu.Unlock()

	root := GetLspWorkspacePythonStubsDirPath()

	version, err := h.pythonRunnerVersion()
	if err != nil {
		runtime.LogWarningf(ctx, "python stubs: %v", err)
		return fallbackStubsDir(ctx, root)
	}

	versionDir := filepath.Join(root, version)
	if stubsAreReady(versionDir) {
		pruneStubsDirs(root, version)
		runtime.LogInfof(ctx, "python stubs already present version=%s dir=%s", version, versionDir)
		return versionDir
	}

	if err := publishStubsForVersion(ctx, root, versionDir, version); err != nil {
		runtime.LogWarningf(ctx, "python stubs: %v", err)
		return fallbackStubsDir(ctx, root)
	}

	pruneStubsDirs(root, version)
	runtime.LogInfof(ctx, "python stubs ready version=%s dir=%s", version, versionDir)
	return versionDir
}

// pythonRunnerVersion asks the board which app-bricks release its runtime matches.
func (h *LSPHandler) pythonRunnerVersion() (string, error) {
	board := h.boardProvider()
	if board == nil {
		return "", errors.New("no board connected")
	}

	boardCtx, cancel := context.WithTimeout(context.Background(), boardVersionTimeout)
	defer cancel()

	version, err := board.GetPythonRunnerVersion(boardCtx)
	if err != nil {
		return "", fmt.Errorf("could not fetch python_runner version from board: %w", err)
	}
	if err := validateStubsVersion(version); err != nil {
		return "", err
	}
	return strings.TrimSpace(version), nil
}

// validateStubsVersion rejects anything unusable as a directory name. The version
// comes off the board and now names a path segment, so a value containing a
// separator or a parent reference would put extraPaths outside python-stubs and hand
// basedpyright a directory we never provisioned. A leading dot is rejected too:
// dot-names are the namespace of our own bookkeeping (.staging-*, .ready), where a
// version directory would be skipped by pruning and fallback alike.
func validateStubsVersion(version string) error {
	trimmed := strings.TrimSpace(version)
	if trimmed == "" {
		return errors.New("board reported an empty python_runner version")
	}
	if strings.ContainsAny(trimmed, `/\`) || trimmed != filepath.Base(trimmed) || strings.HasPrefix(trimmed, ".") {
		return fmt.Errorf("board reported an unusable python_runner version %q", version)
	}
	return nil
}

// stubsReadyMarker is written into a version directory once every file is extracted.
// Its presence, not the directory's, is what makes the stubs usable.
const stubsReadyMarker = ".ready"

// stubsStagingPrefix marks a directory that is mid-extraction. Prefixed with a dot
// so it can never collide with a version.
const stubsStagingPrefix = ".staging-"

func stubsAreReady(versionDir string) bool {
	_, err := os.Stat(filepath.Join(versionDir, stubsReadyMarker))
	return err == nil
}

// fallbackStubsDir picks the best stubs we already have when provisioning could not
// run, and says plainly when there are none — this is the state in which app-bricks
// imports do not resolve and everything else about the Python server looks healthy,
// which is exactly the report that is hard to act on without a log line.
func fallbackStubsDir(ctx context.Context, root string) string {
	dir := newestReadyStubsDir(root)
	if dir == "" {
		runtime.LogWarningf(ctx, "python stubs unavailable: app-bricks types will not resolve, and no earlier stubs exist to fall back on")
		return ""
	}
	runtime.LogWarningf(ctx, "python stubs: falling back to stubs from an earlier run dir=%s", dir)
	return dir
}

// newestReadyStubsDir returns the most recently published complete stubs directory,
// or "" when there is none.
//
// Ordered by mtime rather than by parsing the version: the board's version string is
// opaque to us, and "whatever was extracted last" is the answer we want anyway.
func newestReadyStubsDir(root string) string {
	entries, err := os.ReadDir(root)
	if err != nil {
		return ""
	}

	var newest string
	var newestMod time.Time
	for _, entry := range entries {
		if !entry.IsDir() || strings.HasPrefix(entry.Name(), stubsStagingPrefix) {
			continue
		}
		dir := filepath.Join(root, entry.Name())
		if !stubsAreReady(dir) {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		if newest == "" || info.ModTime().After(newestMod) {
			newest, newestMod = dir, info.ModTime()
		}
	}
	return newest
}

// pruneStubsDirs sweeps what is safe to delete under root: incomplete version
// directories, and the flat layout this replaced, which left arduino/ and .version
// directly under root.
//
// Complete directories for other versions are deliberately kept. A second app
// instance on different board firmware may have one on its extraPaths right now, and
// deleting it underneath that server would cause the very failure this change is
// fixing. They are small, and their number is bounded by how many firmware versions
// a machine ever runs.
//
// Staging directories are skipped because a concurrent instance may be filling one;
// the extraction removes its own on both paths, so one only survives a hard crash.
//
// Best effort throughout: on Windows a directory pyright still watches cannot be
// removed, which costs disk rather than correctness.
func pruneStubsDirs(root, keep string) {
	entries, err := os.ReadDir(root)
	if err != nil {
		return
	}
	for _, entry := range entries {
		name := entry.Name()
		if name == keep || strings.HasPrefix(name, stubsStagingPrefix) {
			continue
		}
		if entry.IsDir() && stubsAreReady(filepath.Join(root, name)) {
			continue
		}
		_ = os.RemoveAll(filepath.Join(root, name))
	}
}

// publishStubsForVersion downloads and unpacks the wheel into a staging directory and
// moves it into place, so a half-extracted tree is never visible as a version.
func publishStubsForVersion(ctx context.Context, root, versionDir, version string) error {
	if err := os.MkdirAll(root, 0o755); err != nil {
		return fmt.Errorf("could not create the stubs root %s: %w", root, err)
	}

	// Staged inside root, not in the system temp dir, so the publish below is a
	// rename within one filesystem rather than a copy that can half-finish.
	stagingDir, err := os.MkdirTemp(root, stubsStagingPrefix+version+"-")
	if err != nil {
		return fmt.Errorf("could not create a staging dir under %s: %w", root, err)
	}
	// A no-op once the rename below has moved it.
	defer os.RemoveAll(stagingDir)

	wheelPath, err := downloadWheel(ctx, wheelURLsFor(version))
	if err != nil {
		return err
	}
	defer os.Remove(wheelPath)

	if err := extractPyFilesFromWheel(wheelPath, stagingDir); err != nil {
		return fmt.Errorf("could not extract the app-bricks-py wheel %s: %w", wheelPath, err)
	}

	// Written last, so it cannot be observed before the files it vouches for.
	if err := os.WriteFile(filepath.Join(stagingDir, stubsReadyMarker), []byte(version), 0o644); err != nil {
		return fmt.Errorf("could not mark the stubs complete: %w", err)
	}

	// Anything already at versionDir is incomplete — a ready one returns early in
	// ensurePythonStubs — so nothing has it on extraPaths and no handle blocks this.
	if err := os.RemoveAll(versionDir); err != nil {
		return fmt.Errorf("could not clear the incomplete stubs dir %s: %w", versionDir, err)
	}
	if err := os.Rename(stagingDir, versionDir); err != nil {
		// Another instance may have published the same version between our check and
		// this rename, which is a success as far as the caller is concerned.
		if stubsAreReady(versionDir) {
			return nil
		}
		return fmt.Errorf("could not publish the stubs to %s: %w", versionDir, err)
	}
	return nil
}

// downloadWheel fetches the wheel from the first candidate URL that serves it. Each
// attempt gets its own timeout, and when none succeeds every failure is reported, so
// the log says which tag schemes were tried rather than just "404".
func downloadWheel(ctx context.Context, urls []string) (string, error) {
	// One deadline for every candidate: the LSP start waits on this download,
	// and a connection that black-holes must not stall it once per URL.
	dlCtx, cancel := context.WithTimeout(ctx, wheelDownloadTimeout)
	defer cancel()

	var errs []error
	for _, wheelURL := range urls {
		wheelPath, err := downloadToTempFile(dlCtx, wheelURL)
		if err == nil {
			return wheelPath, nil
		}
		errs = append(errs, fmt.Errorf("%s: %w", wheelURL, err))
	}
	return "", fmt.Errorf("could not download the app-bricks-py wheel: %w", errors.Join(errs...))
}

func downloadToTempFile(ctx context.Context, downloadURL string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, downloadURL, nil)
	if err != nil {
		return "", err
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("download failed: %s", resp.Status)
	}

	f, err := os.CreateTemp("", "app-bricks-py-*.whl")
	if err != nil {
		return "", err
	}

	if _, err := io.Copy(f, resp.Body); err != nil {
		_ = f.Close()
		_ = os.Remove(f.Name())
		return "", err
	}

	if err := f.Close(); err != nil {
		_ = os.Remove(f.Name())
		return "", err
	}

	return f.Name(), nil
}

func extractPyFilesFromWheel(wheelPath string, dstDir string) error {
	r, err := zip.OpenReader(wheelPath)
	if err != nil {
		return err
	}
	defer r.Close()

	extracted := 0
	for _, f := range r.File {
		name := filepath.ToSlash(f.Name)

		if f.FileInfo().IsDir() {
			continue
		}
		if !f.Mode().IsRegular() {
			continue
		}
		if !isLSPRelevantStubFile(name) {
			continue
		}

		targetPath := filepath.Join(dstDir, filepath.FromSlash(name))
		cleanDst := filepath.Clean(dstDir) + string(os.PathSeparator)
		cleanTarget := filepath.Clean(targetPath)
		if !strings.HasPrefix(cleanTarget, cleanDst) {
			return fmt.Errorf("invalid zip path: %s", f.Name)
		}

		if err := os.MkdirAll(filepath.Dir(cleanTarget), 0o755); err != nil {
			return err
		}

		src, err := f.Open()
		if err != nil {
			return err
		}

		dst, err := os.OpenFile(cleanTarget, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
		if err != nil {
			_ = src.Close()
			return err
		}

		_, copyErr := io.Copy(dst, src)
		closeDstErr := dst.Close()
		closeSrcErr := src.Close()

		if copyErr != nil {
			return copyErr
		}
		if closeDstErr != nil {
			return closeDstErr
		}
		if closeSrcErr != nil {
			return closeSrcErr
		}

		// The rules file rides along with the stubs but is not one: a wheel with
		// no Python entry must still fail the guard below, or a version directory
		// holding nothing to analyze would be published and win the fallback.
		if name != pythonAnalysisRulesRelPath {
			extracted++
		}
	}

	if extracted == 0 {
		return fmt.Errorf("no python files found in app-bricks-py wheel")
	}

	return nil
}

func isLSPRelevantStubFile(name string) bool {
	if name == pythonAnalysisRulesRelPath {
		return true
	}
	lower := strings.ToLower(name)
	if strings.HasSuffix(lower, ".py") {
		return true
	}
	if strings.HasSuffix(lower, ".pyi") {
		return true
	}
	if filepath.Base(name) == "py.typed" {
		return true
	}
	return false
}

// ensurePythonVenvStub creates, under base, the empty site-packages directory
// that stops basedpyright from going looking for a Python interpreter.
//
// findPythonSearchPaths resolves <venvPath>/<venv>/{lib,lib64,Lib}/site-packages
// and returns early the moment one of them exists; only when that finds nothing
// does it fall back to spawning an interpreter. That fallback runs a *bare*
// `python3` (pyright's own default, as we set no pythonPath), which on macOS is
// Apple's /usr/bin/python3 shim: on any machine without the Xcode Command Line
// Tools it pops the "python3 command requires the command line developer tools"
// system dialog the first time a .py file is opened. Dev machines have a real
// interpreter earlier on PATH, which is why this never showed up in-house.
//
// An empty directory is enough, and losing the host's site-packages costs us
// nothing: the app runs on the board, not on the host, so the host environment
// was never the right answer. The types that matter come from the app-bricks
// stubs in extraPaths plus basedpyright's bundled typeshed.
//
// Takes base rather than deriving it so a test can exercise it against a temp
// dir instead of the caller's real install.
func ensurePythonVenvStub(base string) {
	sitePackages := filepath.Join(base, pythonVenvName, "lib", "site-packages")
	if err := os.MkdirAll(sitePackages, 0o755); err != nil {
		// Non-fatal: pyright still works, it just resumes probing for an
		// interpreter, so the macOS dialog can come back.
		slog.Warn("could not create python venv stub, basedpyright may probe for an interpreter", "path", sitePackages, "error", err)
	}
}

// pythonAnalysisRulesRelPath is where the app-bricks-py wheel ships the analysis
// rules, next to the other static assets of the library. The path is relative to
// the stubs directory the wheel is extracted into.
const pythonAnalysisRulesRelPath = "arduino/app_bricks/static/pyright-rules.json"

// pythonAnalysisRulesSchemaVersion is the only schema of pyright-rules.json this
// build understands; a newer one is treated like a missing file.
const pythonAnalysisRulesSchemaVersion = 1

// pythonAnalysisProfileName is the profile of pyright-rules.json that applies to
// code written against the library API: the apps edited here, the same way the
// library's CI checks the published examples. The file's other profile
// (app-bricks-py) is for the library checking itself, and is stricter than user
// code should face.
const pythonAnalysisProfileName = "api-user"

// defaultTypeCheckingMode applies when the wheel carries no usable rules file:
// wheels older than the rules, a download that fell back to nothing, or a file
// this build cannot parse. "standard" is pyright's own default and the mode the
// library's CI runs on the published examples, so it is the closest thing to what
// the library authors verified; it is also what those authors chose as the
// initial content of the api-user profile.
const defaultTypeCheckingMode = "standard"

// pythonAnalysisRules is how the library wants user code analyzed, as resolved
// from pyright-rules.json for pythonAnalysisProfileName. The library decides the
// type-checking mode, the per-rule severities, the Python version its runtime
// provides and whether its sources stand in for stubs, and ships them with every
// release, so a change in the library's annotations can carry the rule it needs
// without a desktop release; the desktop owns only the environment (paths, venv,
// execution root). The zero value means "no rules": buildPyrightConfig then
// applies the defaults above.
type pythonAnalysisRules struct {
	TypeCheckingMode string
	Rules            map[string]any
	// PythonVersion is the Python the apps run on; empty means defaultPythonVersion.
	PythonVersion string
	// UseLibraryCodeForTypes says whether the library sources are to be read
	// for types; nil means yes, the library ships no stubs.
	UseLibraryCodeForTypes *bool
	// PyrightVersion is the pyright the library verified the rules with. It is
	// only logged: basedpyright tracks pyright with a delay, and the two
	// versions explain a diagnostic that differs from the library's CI.
	PyrightVersion string
}

// pythonAnalysisRulesFile is the on-disk shape of pyright-rules.json, schema 1.
type pythonAnalysisRulesFile struct {
	SchemaVersion          int                              `json:"schemaVersion"`
	PythonVersion          string                           `json:"pythonVersion"`
	PyrightVersion         string                           `json:"pyrightVersion"`
	UseLibraryCodeForTypes *bool                            `json:"useLibraryCodeForTypes"`
	Profiles               map[string]pythonAnalysisProfile `json:"profiles"`
}

// pythonAnalysisProfile is one entry of the profiles map of pyright-rules.json.
type pythonAnalysisProfile struct {
	TypeCheckingMode string         `json:"typeCheckingMode"`
	Rules            map[string]any `json:"rules"`
}

// pyrightTypeCheckingModes are the values basedpyright accepts for typeCheckingMode.
var pyrightTypeCheckingModes = map[string]bool{"off": true, "basic": true, "standard": true, "strict": true, "recommended": true, "all": true}

// pyrightRuleSeverities are the values a report* rule can take, besides a boolean:
// pyright's four plus "hint", which basedpyright adds.
var pyrightRuleSeverities = map[string]bool{"none": true, "hint": true, "information": true, "warning": true, "error": true}

// isPythonVersion reports whether s is a pythonVersion basedpyright parses: two or
// more dot-separated numbers, "3.13" or "3.13.2" alike.
func isPythonVersion(s string) bool {
	parts := strings.Split(s, ".")
	if len(parts) < 2 {
		return false
	}
	for _, part := range parts {
		if part == "" || strings.Trim(part, "0123456789") != "" {
			return false
		}
	}
	return true
}

// loadPythonAnalysisRules reads pyright-rules.json from the wheel extracted into
// stubsDir and resolves the api-user profile. Any problem with the file or with
// that profile is an error for the caller to log and fall back on: a half-applied
// rules file would be harder to diagnose than the defaults. Only the applied
// profile is validated, so a slip in a profile this build does not use cannot
// degrade the editor; the library's own CI validates the file as a whole.
func loadPythonAnalysisRules(stubsDir string) (pythonAnalysisRules, error) {
	var rules pythonAnalysisRules
	if stubsDir == "" {
		return rules, errors.New("no stubs directory to read the rules from")
	}
	path := filepath.Join(stubsDir, filepath.FromSlash(pythonAnalysisRulesRelPath))
	data, err := os.ReadFile(path)
	if err != nil {
		return rules, err
	}
	var file pythonAnalysisRulesFile
	if err := json.Unmarshal(data, &file); err != nil {
		return rules, fmt.Errorf("%s: %w", path, err)
	}
	if file.SchemaVersion != pythonAnalysisRulesSchemaVersion {
		return rules, fmt.Errorf("%s: unsupported schemaVersion %d, want %d", path, file.SchemaVersion, pythonAnalysisRulesSchemaVersion)
	}
	if file.PythonVersion != "" && !isPythonVersion(file.PythonVersion) {
		// Optional and unrelated to the rules: losing the whole profile over it
		// would be out of proportion, so the default version applies instead.
		slog.Warn("python analysis rules: ignoring malformed pythonVersion, using the default", "path", path, "pythonVersion", file.PythonVersion, "default", defaultPythonVersion)
		file.PythonVersion = ""
	}
	profile, ok := file.Profiles[pythonAnalysisProfileName]
	if !ok {
		return rules, fmt.Errorf("%s: no %s profile", path, pythonAnalysisProfileName)
	}
	if !pyrightTypeCheckingModes[profile.TypeCheckingMode] {
		return rules, fmt.Errorf("%s: profile %s has an unknown typeCheckingMode %q", path, pythonAnalysisProfileName, profile.TypeCheckingMode)
	}
	for name, value := range profile.Rules {
		if !strings.HasPrefix(name, "report") {
			return rules, fmt.Errorf("%s: profile %s: %q is not a report* rule", path, pythonAnalysisProfileName, name)
		}
		switch v := value.(type) {
		case bool:
		case string:
			if !pyrightRuleSeverities[v] {
				return rules, fmt.Errorf("%s: profile %s: rule %s has an unknown severity %q", path, pythonAnalysisProfileName, name, v)
			}
		default:
			return rules, fmt.Errorf("%s: profile %s: rule %s has an unsupported value %v", path, pythonAnalysisProfileName, name, value)
		}
	}
	return pythonAnalysisRules{
		TypeCheckingMode:       profile.TypeCheckingMode,
		Rules:                  profile.Rules,
		PythonVersion:          file.PythonVersion,
		UseLibraryCodeForTypes: file.UseLibraryCodeForTypes,
		PyrightVersion:         file.PyrightVersion,
	}, nil
}

// buildPyrightConfig returns the pyrightconfig.json contents for an app rooted
// at workspaceDir, resolving the app-bricks stubs from stubsDir and the stub
// virtual environment from venvBase, and analyzing the code the way rules asks.
//
// Two owners share the file. The library, through rules, decides how user code is
// checked: the type-checking mode, the report* severities, the Python version and
// whether its sources are read for types. The desktop decides the environment:
// where the sources are, where the stubs are, which interpreter (none) to probe,
// and the two rules below that only make sense knowing that environment.
// Anything rules sets for those two is overridden, on purpose.
func buildPyrightConfig(workspaceDir, stubsDir, venvBase string, rules pythonAnalysisRules) map[string]any {
	mode := rules.TypeCheckingMode
	if mode == "" {
		mode = defaultTypeCheckingMode
	}
	pythonVersion := rules.PythonVersion
	if pythonVersion == "" {
		pythonVersion = defaultPythonVersion
	}
	useLibraryCodeForTypes := true
	if rules.UseLibraryCodeForTypes != nil {
		useLibraryCodeForTypes = *rules.UseLibraryCodeForTypes
	}

	config := map[string]any{}
	for name, value := range rules.Rules {
		config[name] = value
	}

	maps.Copy(config, map[string]any{
		"pythonVersion":    pythonVersion,
		"typeCheckingMode": mode,
		"include":          []string{workspaceDir},

		// Points at the stub venv from ensurePythonVenvStub. Both keys are
		// required: findPythonSearchPaths ignores venvPath unless venv is also
		// set, and then spawns `python3` — which is a Command Line Tools install
		// prompt on a stock macOS.
		"venvPath": venvBase,
		"venv":     pythonVenvName,

		// The execution environment root is what pyright resolves *absolute*
		// imports against, and it has to be named explicitly here. Handing the
		// server a configFilePath makes the directory holding that file the
		// project root, and ours lives in python-config/ — nowhere near the app
		// — so "from two import x" and "from pkg.thing import y" resolved
		// against an empty directory and silently found nothing: no
		// go-to-definition, no completion, no hover. Relative imports ("from
		// .two import x") resolve against the importing file instead, which is
		// why only they ever worked.
		//
		// `include` cannot stand in for this: it selects which files get
		// analysed, and contributes nothing to the import search path. The
		// environment inherits the extraPaths above, so the stubs stay visible.
		//
		// The root is the python/ subfolder, not the app dir, because that is
		// what ends up on sys.path when the board runs the app: the entrypoint
		// is <app>/python/main.py, so sys.path[0] is <app>/python. Rooting one
		// level up at the app dir leaves siblings reachable only through
		// basedpyright's implicit-relative fallback, which resolves them but
		// then reports every one of them as reportImplicitRelativeImport —
		// imports that are in fact correct for how the app is executed.
		"executionEnvironments": []map[string]any{
			{"root": filepath.Join(workspaceDir, pythonDirName)},
		},

		// The library ships sources, not stubs, and its own dependencies are not
		// in the stub venv: without this the arduino modules would resolve to
		// nothing useful. The rules file states it too; the default covers
		// wheels older than the rules.
		"useLibraryCodeForTypes": useLibraryCodeForTypes,
		// Environment-owned: the stub venv holds no third-party package, so
		// unresolved imports say nothing about the user's code. The library
		// cannot know that, hence these two are never taken from the rules.
		"reportMissingImports":      "none",
		"reportMissingModuleSource": "none",
	})

	// Omitted entirely rather than passed empty when there are no stubs: pyright
	// resolves a relative extraPath against the project root, so "" would quietly
	// add the root itself to the search path instead of adding nothing.
	if stubsDir != "" {
		config["extraPaths"] = []string{stubsDir}
	}

	return config
}

// initPyrightConfig writes the config, resolving app-bricks stubs from stubsDir as
// returned by ensurePythonStubs — the version directory it actually provisioned,
// which is not derivable from the workspace layout alone. An empty stubsDir means
// there are no stubs to point at.
func (h *LSPHandler) initPyrightConfig(workspaceDir, stubsDir string) {
	ctx := h.ctxHolder.Get()
	configPath := getPyrightConfigPath()
	venvBase := GetLspWorkspacePythonVenvBase()
	ensurePythonVenvStub(venvBase)

	rules, err := loadPythonAnalysisRules(stubsDir)
	if err != nil {
		runtime.LogWarningf(ctx, "python analysis rules: %v; falling back to typeCheckingMode=%s", err, defaultTypeCheckingMode)
		rules = pythonAnalysisRules{}
	} else {
		runtime.LogInfof(ctx, "python analysis rules loaded from the app-bricks wheel profile=%s typeCheckingMode=%s rules=%d pythonVersion=%q pyrightVersion=%q",
			pythonAnalysisProfileName, rules.TypeCheckingMode, len(rules.Rules), rules.PythonVersion, rules.PyrightVersion)
	}

	config := buildPyrightConfig(workspaceDir, stubsDir, venvBase, rules)
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		runtime.LogErrorf(ctx, "failed to marshal pyright config: %v", err)
		return
	}
	if err := os.WriteFile(configPath, data, 0o644); err != nil {
		runtime.LogErrorf(ctx, "failed to write pyrightconfig.json %s: %v", configPath, err)
	} else {
		runtime.LogInfof(ctx, "wrote pyrightconfig.json path=%s pythonVersion=%s typeCheckingMode=%s", configPath, config["pythonVersion"], config["typeCheckingMode"])
	}
}

func (h *LSPHandler) sendPyrightConfigPath() {
	h.stateMu.RLock()
	mainProc := h.processes[ProcessId(LSP_Python)]
	h.stateMu.RUnlock()

	if mainProc == nil {
		return
	}

	msg := map[string]any{
		"jsonrpc": "2.0",
		"method":  methodDidChangeConfig,
		"params": map[string]any{
			"settings": map[string]any{
				"basedpyright": map[string]any{
					"analysis": map[string]any{
						"configFilePath": getPyrightConfigPath(),
					},
				},
			},
		},
	}

	if err := sendToProc(mainProc, msg); err != nil {
		slog.Error("failed to send pyright config", "error", err)
	}
}
