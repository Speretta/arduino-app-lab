package lsp

import (
	"os"
	"path/filepath"
	"testing"
)

// The pyright config lives outside the app directory, which makes that outside
// directory pyright's project root — and therefore the root it resolves
// absolute imports against. Only executionEnvironments points it back at the
// app's Python sources, so pin that the config keeps saying so.
//
// The root has to be <app>/python, matching sys.path[0] when the board runs
// <app>/python/main.py. At <app> the imports still resolve, but only via
// basedpyright's implicit-relative fallback, which flags every sibling import
// as reportImplicitRelativeImport; at the config's own directory they do not
// resolve at all and go-to-definition dies.
func TestBuildPyrightConfigRootsExecutionEnvAtPythonDir(t *testing.T) {
	const workspaceDir = "/tmp/arduino_applab_workspace/app"
	const stubsDir = "/data/arduino_applab_workspace/python-stubs"
	const venvBase = "/data/arduino_applab_workspace/python-venv"

	config := buildPyrightConfig(workspaceDir, stubsDir, venvBase, pythonAnalysisRules{})

	envs, ok := config["executionEnvironments"].([]map[string]any)
	if !ok {
		t.Fatalf("executionEnvironments = %#v, want []map[string]any", config["executionEnvironments"])
	}
	if len(envs) != 1 {
		t.Fatalf("got %d execution environments, want 1", len(envs))
	}
	want := filepath.Join(workspaceDir, "python")
	if root := envs[0]["root"]; root != want {
		t.Fatalf("execution environment root = %v, want %q", root, want)
	}

	// The environment inherits these, so the stubs must stay at the top level.
	extraPaths, ok := config["extraPaths"].([]string)
	if !ok || len(extraPaths) != 1 || extraPaths[0] != stubsDir {
		t.Fatalf("extraPaths = %#v, want [%q]", config["extraPaths"], stubsDir)
	}

	// Analysis still covers the whole app, not just python/ — an app can hold
	// .py files elsewhere and they should keep getting diagnostics.
	include, ok := config["include"].([]string)
	if !ok || len(include) != 1 || include[0] != workspaceDir {
		t.Fatalf("include = %#v, want [%q]", config["include"], workspaceDir)
	}
}

// basedpyright only skips its interpreter probe when venvPath AND venv are both
// set and the site-packages under them exists. Drop either and it spawns a bare
// `python3`, which on a Mac without the Xcode Command Line Tools is a system
// dialog rather than an interpreter.
func TestBuildPyrightConfigPinsStubVenv(t *testing.T) {
	const workspaceDir = "/tmp/arduino_applab_workspace/app"
	const stubsDir = "/data/arduino_applab_workspace/python-stubs"
	const venvBase = "/data/arduino_applab_workspace/python-venv"

	config := buildPyrightConfig(workspaceDir, stubsDir, venvBase, pythonAnalysisRules{})

	if got := config["venvPath"]; got != venvBase {
		t.Fatalf("venvPath = %v, want %q", got, venvBase)
	}
	if got := config["venv"]; got != pythonVenvName {
		t.Fatalf("venv = %v, want %q", got, pythonVenvName)
	}
}

// The layout is basedpyright's, not ours: it probes
// <venvPath>/<venv>/{lib,lib64,Lib}/site-packages and only that shape short-
// circuits the interpreter probe, so pin it against a silent rename.
func TestEnsurePythonVenvStubCreatesSitePackages(t *testing.T) {
	base := t.TempDir()

	ensurePythonVenvStub(base)

	sitePackages := filepath.Join(base, pythonVenvName, "lib", "site-packages")
	info, err := os.Stat(sitePackages)
	if err != nil {
		t.Fatalf("stat %s: %v", sitePackages, err)
	}
	if !info.IsDir() {
		t.Fatalf("%s is not a directory", sitePackages)
	}
}

// The board supplies this string and it now names a directory, so a separator or a
// parent reference would point extraPaths outside python-stubs entirely.
func TestValidateStubsVersionRejectsUnusableNames(t *testing.T) {
	for _, tc := range []struct {
		version string
		wantErr bool
	}{
		{version: "1.4.2"},
		{version: "2026.8.0-rc1"},
		{version: "", wantErr: true},
		{version: "   ", wantErr: true},
		{version: ".", wantErr: true},
		{version: "..", wantErr: true},
		{version: "../../evil", wantErr: true},
		// Dot-names are our own bookkeeping namespace: a version named like the
		// staging prefix or the ready marker would be invisible to pruning and
		// fallback, which skip them by design.
		{version: stubsStagingPrefix + "1.0.0", wantErr: true},
		{version: stubsReadyMarker, wantErr: true},
		{version: ".hidden", wantErr: true},
		{version: "a/b", wantErr: true},
		{version: `a\b`, wantErr: true},
	} {
		err := validateStubsVersion(tc.version)
		if tc.wantErr && err == nil {
			t.Errorf("validateStubsVersion(%q) = nil, want an error", tc.version)
		}
		if !tc.wantErr && err != nil {
			t.Errorf("validateStubsVersion(%q) = %v, want nil", tc.version, err)
		}
	}
}

// writeReadyStubs plants a complete version directory, the way publishStubsForVersion
// leaves one behind.
func writeReadyStubs(t *testing.T, root, version string) string {
	t.Helper()

	dir := filepath.Join(root, version)
	pkg := filepath.Join(dir, "arduino", "app_bricks")
	if err := os.MkdirAll(pkg, 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", pkg, err)
	}
	if err := os.WriteFile(filepath.Join(pkg, "__init__.py"), []byte("x = 1\n"), 0o644); err != nil {
		t.Fatalf("write stub: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, stubsReadyMarker), []byte(version), 0o644); err != nil {
		t.Fatalf("write marker: %v", err)
	}
	return dir
}

// A directory without the marker is a half-finished extraction. Handing one to
// basedpyright is the failure that reached a tester as "app bricks stopped working",
// so it must never be chosen.
func TestNewestReadyStubsDirSkipsIncompleteAndStagingDirs(t *testing.T) {
	root := t.TempDir()

	// Incomplete: files but no marker.
	partial := filepath.Join(root, "9.9.9", "arduino")
	if err := os.MkdirAll(partial, 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", partial, err)
	}
	// Mid-extraction, marker and all.
	staging := filepath.Join(root, stubsStagingPrefix+"9.9.9-tmp")
	if err := os.MkdirAll(staging, 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", staging, err)
	}
	if err := os.WriteFile(filepath.Join(staging, stubsReadyMarker), []byte("9.9.9"), 0o644); err != nil {
		t.Fatalf("write marker: %v", err)
	}

	if got := newestReadyStubsDir(root); got != "" {
		t.Fatalf("newestReadyStubsDir() = %q, want \"\" with nothing complete", got)
	}

	want := writeReadyStubs(t, root, "1.0.0")
	if got := newestReadyStubsDir(root); got != want {
		t.Fatalf("newestReadyStubsDir() = %q, want %q", got, want)
	}
}

func TestPruneStubsDirsKeepsCompleteVersionsAndSweepsTheRest(t *testing.T) {
	root := t.TempDir()

	inUse := writeReadyStubs(t, root, "2.0.0")
	otherComplete := writeReadyStubs(t, root, "1.0.0")

	// The layout this replaced: package dirs and a .version file directly under root.
	legacyPkg := filepath.Join(root, "arduino", "app_bricks")
	if err := os.MkdirAll(legacyPkg, 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", legacyPkg, err)
	}
	legacyVersion := filepath.Join(root, ".version")
	if err := os.WriteFile(legacyVersion, []byte("0.9.0"), 0o644); err != nil {
		t.Fatalf("write %s: %v", legacyVersion, err)
	}
	// A half-finished directory for a version nobody is using.
	incomplete := filepath.Join(root, "1.5.0")
	if err := os.MkdirAll(incomplete, 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", incomplete, err)
	}

	pruneStubsDirs(root, "2.0.0")

	for _, keep := range []string{inUse, otherComplete} {
		if _, err := os.Stat(filepath.Join(keep, stubsReadyMarker)); err != nil {
			// Other complete versions stay: a second app instance on different board
			// firmware may have one on its extraPaths right now.
			t.Fatalf("%s was pruned, want it kept: %v", keep, err)
		}
	}
	for _, gone := range []string{filepath.Join(root, "arduino"), legacyVersion, incomplete} {
		if _, err := os.Stat(gone); err == nil {
			t.Fatalf("%s survived pruning, want it swept", gone)
		}
	}
}

// An empty extraPath is not the same as no extraPath: pyright resolves a relative one
// against the project root, so passing "" would add the root to the search path.
func TestBuildPyrightConfigOmitsExtraPathsWithoutStubs(t *testing.T) {
	config := buildPyrightConfig(t.TempDir(), "", t.TempDir(), pythonAnalysisRules{})
	if _, ok := config["extraPaths"]; ok {
		t.Fatalf("extraPaths = %v, want the key absent when there are no stubs", config["extraPaths"])
	}

	stubs := t.TempDir()
	config = buildPyrightConfig(t.TempDir(), stubs, t.TempDir(), pythonAnalysisRules{})
	got, ok := config["extraPaths"].([]string)
	if !ok || len(got) != 1 || got[0] != stubs {
		t.Fatalf("extraPaths = %v, want [%q]", config["extraPaths"], stubs)
	}
}

// writeRulesFile plants a pyright-rules.json where the wheel extraction would put it.
func writeRulesFile(t *testing.T, stubsDir, content string) {
	t.Helper()
	path := filepath.Join(stubsDir, filepath.FromSlash(pythonAnalysisRulesRelPath))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

// The library decides how user code is analyzed: mode and rule severities come
// from the wheel, and reach the config as they are.
func TestBuildPyrightConfigTakesModeAndRulesFromTheLibrary(t *testing.T) {
	rules := pythonAnalysisRules{
		TypeCheckingMode: "strict",
		Rules:            map[string]any{"reportUnusedImport": "warning", "reportOptionalMemberAccess": false},
	}
	config := buildPyrightConfig(t.TempDir(), t.TempDir(), t.TempDir(), rules)

	if got := config["typeCheckingMode"]; got != "strict" {
		t.Fatalf("typeCheckingMode = %v, want strict", got)
	}
	if got := config["reportUnusedImport"]; got != "warning" {
		t.Fatalf("reportUnusedImport = %v, want warning", got)
	}
	if got := config["reportOptionalMemberAccess"]; got != false {
		t.Fatalf("reportOptionalMemberAccess = %v, want false", got)
	}
}

// The Python version of the runtime and whether the library sources are read for
// types are facts about the library, so the wheel states them and they win over
// the defaults.
func TestBuildPyrightConfigTakesRuntimeFactsFromTheLibrary(t *testing.T) {
	noLibraryCode := false
	rules := pythonAnalysisRules{
		TypeCheckingMode:       "standard",
		PythonVersion:          "3.14",
		UseLibraryCodeForTypes: &noLibraryCode,
	}
	config := buildPyrightConfig(t.TempDir(), t.TempDir(), t.TempDir(), rules)

	if got := config["pythonVersion"]; got != "3.14" {
		t.Fatalf("pythonVersion = %v, want 3.14", got)
	}
	if got := config["useLibraryCodeForTypes"]; got != false {
		t.Fatalf("useLibraryCodeForTypes = %v, want false", got)
	}
}

// Without a rules file the mode is standard, explicitly: the library's CI checks
// the published examples with pyright's default, and "recommended" produced
// hundreds of stylistic diagnostics on beginner code. The Python version is the
// one of the app container and the library sources are read for types, since the
// library ships no stubs.
func TestBuildPyrightConfigFallsBackToStandard(t *testing.T) {
	config := buildPyrightConfig(t.TempDir(), t.TempDir(), t.TempDir(), pythonAnalysisRules{})
	if got := config["typeCheckingMode"]; got != "standard" {
		t.Fatalf("typeCheckingMode = %v, want standard", got)
	}
	if got := config["pythonVersion"]; got != defaultPythonVersion {
		t.Fatalf("pythonVersion = %v, want %s", got, defaultPythonVersion)
	}
	if got := config["useLibraryCodeForTypes"]; got != true {
		t.Fatalf("useLibraryCodeForTypes = %v, want true", got)
	}
}

// The two import rules describe the desktop's environment (an empty stub venv),
// which the library cannot know about: whatever the rules file says, they stay off.
func TestBuildPyrightConfigKeepsEnvironmentRulesOverLibraryOnes(t *testing.T) {
	rules := pythonAnalysisRules{
		TypeCheckingMode: "standard",
		Rules:            map[string]any{"reportMissingImports": "error", "reportMissingModuleSource": "warning"},
	}
	config := buildPyrightConfig(t.TempDir(), t.TempDir(), t.TempDir(), rules)
	if got := config["reportMissingImports"]; got != "none" {
		t.Fatalf("reportMissingImports = %v, want none", got)
	}
	if got := config["reportMissingModuleSource"]; got != "none" {
		t.Fatalf("reportMissingModuleSource = %v, want none", got)
	}
}

// shippedRulesFile mirrors the pyright-rules.json app-bricks-py publishes: two
// profiles, of which api-user is the one for code written against the library.
const shippedRulesFile = `{
  "schemaVersion": 1,
  "description": "How Python code that uses this library is type-checked.",
  "pythonVersion": "3.13",
  "pyrightVersion": "1.1.411",
  "useLibraryCodeForTypes": true,
  "profiles": {
    "app-bricks-py": {
      "description": "The library checked against itself.",
      "typeCheckingMode": "strict",
      "rules": {"reportUnknownMemberType": "warning", "reportDeprecated": "warning"}
    },
    "api-user": {
      "description": "Code written against the library API.",
      "typeCheckingMode": "standard",
      "rules": {"reportUnusedImport": "warning", "reportImplicitOverride": true}
    }
  }
}`

// The api-user profile is the one applied to the apps, never the library's own.
func TestLoadPythonAnalysisRulesReadsTheApiUserProfile(t *testing.T) {
	stubs := t.TempDir()
	writeRulesFile(t, stubs, shippedRulesFile)

	rules, err := loadPythonAnalysisRules(stubs)
	if err != nil {
		t.Fatalf("loadPythonAnalysisRules() = %v, want nil", err)
	}
	if rules.TypeCheckingMode != "standard" {
		t.Fatalf("typeCheckingMode = %q, want standard (the api-user profile, not app-bricks-py)", rules.TypeCheckingMode)
	}
	if len(rules.Rules) != 2 || rules.Rules["reportUnusedImport"] != "warning" || rules.Rules["reportImplicitOverride"] != true {
		t.Fatalf("rules = %v, want the two api-user rules", rules.Rules)
	}
	if rules.PythonVersion != "3.13" || rules.PyrightVersion != "1.1.411" {
		t.Fatalf("versions = %q/%q, want 3.13/1.1.411", rules.PythonVersion, rules.PyrightVersion)
	}
	if rules.UseLibraryCodeForTypes == nil || !*rules.UseLibraryCodeForTypes {
		t.Fatalf("useLibraryCodeForTypes = %v, want true", rules.UseLibraryCodeForTypes)
	}
}

// A file that only names the profiles is enough: the runtime facts are optional
// and buildPyrightConfig fills them with the defaults.
func TestLoadPythonAnalysisRulesAcceptsAMinimalFile(t *testing.T) {
	stubs := t.TempDir()
	writeRulesFile(t, stubs, `{"schemaVersion": 1, "profiles": {"api-user": {"typeCheckingMode": "basic"}}}`)

	rules, err := loadPythonAnalysisRules(stubs)
	if err != nil {
		t.Fatalf("loadPythonAnalysisRules() = %v, want nil", err)
	}
	if rules.TypeCheckingMode != "basic" || len(rules.Rules) != 0 || rules.PythonVersion != "" || rules.UseLibraryCodeForTypes != nil {
		t.Fatalf("rules = %+v, want basic with nothing else set", rules)
	}
}

// The severities and the pythonVersion shapes basedpyright accepts are accepted
// here too, "hint" included: this build must never be stricter than the server
// it configures, or a rule the library legitimately ships would drop the whole file.
func TestLoadPythonAnalysisRulesAcceptsWhatBasedpyrightAccepts(t *testing.T) {
	stubs := t.TempDir()
	writeRulesFile(t, stubs, `{"schemaVersion": 1, "pythonVersion": "3.13.2", "profiles": {"api-user": {"typeCheckingMode": "standard", "rules": {"reportUnreachable": "hint"}}}}`)

	rules, err := loadPythonAnalysisRules(stubs)
	if err != nil {
		t.Fatalf("loadPythonAnalysisRules() = %v, want nil", err)
	}
	if rules.PythonVersion != "3.13.2" || rules.Rules["reportUnreachable"] != "hint" {
		t.Fatalf("rules = %+v, want pythonVersion 3.13.2 and reportUnreachable hint", rules)
	}
}

// pythonVersion is optional and says nothing about the rules: a malformed one is
// dropped, the profile survives and the default version applies.
func TestLoadPythonAnalysisRulesIgnoresAMalformedPythonVersion(t *testing.T) {
	stubs := t.TempDir()
	writeRulesFile(t, stubs, `{"schemaVersion": 1, "pythonVersion": "3", "profiles": {"api-user": {"typeCheckingMode": "basic"}}}`)

	rules, err := loadPythonAnalysisRules(stubs)
	if err != nil {
		t.Fatalf("loadPythonAnalysisRules() = %v, want nil", err)
	}
	if rules.TypeCheckingMode != "basic" || rules.PythonVersion != "" {
		t.Fatalf("rules = %+v, want the profile kept and no pythonVersion", rules)
	}
	if got := buildPyrightConfig(t.TempDir(), stubs, t.TempDir(), rules)["pythonVersion"]; got != defaultPythonVersion {
		t.Fatalf("pythonVersion = %v, want the default %s", got, defaultPythonVersion)
	}
}

// Only the applied profile has to be sound: a slip in a profile this build never
// uses is the library's problem, not a reason to degrade the editor.
func TestLoadPythonAnalysisRulesIgnoresOtherProfiles(t *testing.T) {
	stubs := t.TempDir()
	writeRulesFile(t, stubs, `{"schemaVersion": 1, "profiles": {
		"api-user": {"typeCheckingMode": "standard"},
		"app-bricks-py": {"typeCheckingMode": "relaxed", "rules": {"extraPaths": "/etc"}}}}`)

	if _, err := loadPythonAnalysisRules(stubs); err != nil {
		t.Fatalf("loadPythonAnalysisRules() = %v, want nil", err)
	}
}

// Anything the desktop cannot vouch for is an error, so the caller falls back to
// the defaults instead of handing basedpyright a config it may reject silently.
func TestLoadPythonAnalysisRulesRejectsWhatItCannotApply(t *testing.T) {
	profile := func(body string) string {
		return `{"schemaVersion": 1, "profiles": {"api-user": {` + body + `}}}`
	}
	cases := map[string]string{
		"unknown mode":           profile(`"typeCheckingMode": "relaxed"`),
		"missing mode":           profile(`"rules": {}`),
		"non-rule key":           profile(`"typeCheckingMode": "standard", "rules": {"extraPaths": "/etc"}`),
		"unknown severity":       profile(`"typeCheckingMode": "standard", "rules": {"reportUnusedImport": "loud"}`),
		"non-scalar rule value":  profile(`"typeCheckingMode": "standard", "rules": {"reportUnusedImport": ["warning"]}`),
		"newer schema":           `{"schemaVersion": 2, "profiles": {"api-user": {"typeCheckingMode": "standard"}}}`,
		"no profiles":            `{"schemaVersion": 1}`,
		"no api-user profile":    `{"schemaVersion": 1, "profiles": {"app-bricks-py": {"typeCheckingMode": "strict"}}}`,
		"flat pre-profiles file": `{"schemaVersion": 1, "typeCheckingMode": "standard", "rules": {}}`,
		"invalid json":           `{`,
	}
	for name, content := range cases {
		stubs := t.TempDir()
		writeRulesFile(t, stubs, content)
		if _, err := loadPythonAnalysisRules(stubs); err == nil {
			t.Fatalf("%s: loadPythonAnalysisRules() = nil, want an error", name)
		}
	}

	if _, err := loadPythonAnalysisRules(t.TempDir()); err == nil {
		t.Fatal("missing file: loadPythonAnalysisRules() = nil, want an error")
	}
	if _, err := loadPythonAnalysisRules(""); err == nil {
		t.Fatal("no stubs: loadPythonAnalysisRules() = nil, want an error")
	}
}

// The rules file is the one non-Python entry the extraction has to keep.
func TestIsLSPRelevantStubFileKeepsTheRulesFile(t *testing.T) {
	if !isLSPRelevantStubFile(pythonAnalysisRulesRelPath) {
		t.Fatalf("%s is filtered out of the extraction", pythonAnalysisRulesRelPath)
	}
	if isLSPRelevantStubFile("arduino/app_bricks/static/bricks-list.yaml") {
		t.Fatal("other static assets must stay filtered out")
	}
}
