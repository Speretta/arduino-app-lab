//go:build linux

package terminal

// Test with:
// cd standalone-apps/app-lab-desktop
// go test -v ./internal/terminal

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// makeStubTerminal creates an executable stub of a terminal emulator in a
// temporary directory and returns the directory. The stub records the arguments
// it receives in the file pointed by the STUB_ARGS_FILE environment variable and
// it fails when the first argument is the one listed in STUB_FAIL_ON.
func makeStubTerminal(t *testing.T, names ...string) string {
	t.Helper()
	dir := t.TempDir()
	for _, name := range names {
		script := "#!/bin/sh\n" +
			"if [ -n \"$STUB_ARGS_FILE\" ]; then printf '%s\\n' \"$*\" > \"$STUB_ARGS_FILE\"; fi\n" +
			"if [ \"$1\" = \"$STUB_FAIL_ON\" ]; then echo \"unsupported option\" >&2; exit 1; fi\n" +
			"exit 0\n"
		require.NoError(t, os.WriteFile(filepath.Join(dir, name), []byte(script), 0755))
	}
	return dir
}

func TestDetectTerminals(t *testing.T) {
	dir := makeStubTerminal(t, "alacritty", "ghostty")
	t.Setenv("PATH", dir)

	detected := detectTerminals()
	require.Len(t, detected, 2)
	require.Equal(t, "alacritty", detected[0].ID)
	require.Equal(t, "Alacritty", detected[0].Label)
	require.Equal(t, filepath.Join(dir, "alacritty"), detected[0].Path)
	require.Equal(t, "ghostty", detected[1].ID)
}

func TestDetectTerminalsWithoutTerminals(t *testing.T) {
	t.Setenv("PATH", t.TempDir())

	require.Empty(t, detectTerminals())
}

func TestListAvailable(t *testing.T) {
	dir := makeStubTerminal(t, "kitty")
	t.Setenv("PATH", dir)

	catalog := ListAvailable()
	require.True(t, catalog.Supported)
	require.Len(t, catalog.Terminals, 1)
	require.Equal(t, "kitty", catalog.Terminals[0].ID)
}

func TestExpandInvocation(t *testing.T) {
	const script = "/tmp/app-lab-terminal-123/run.sh"

	var invocationTests = map[string]struct {
		candidate string
		expected  []string
	}{
		"GNOME Terminal": {
			candidate: "gnome-terminal",
			expected:  []string{"--", "sh", script},
		},
		"Konsole": {
			candidate: "konsole",
			expected:  []string{"-e", "sh", script},
		},
		"Xfce Terminal": {
			candidate: "xfce4-terminal",
			expected:  []string{"-e", "sh " + script},
		},
		"MATE Terminal": {
			candidate: "mate-terminal",
			expected:  []string{"--disable-factory", "-e", "sh " + script},
		},
		"Ptyxis": {
			candidate: "ptyxis",
			expected:  []string{"--", "sh", script},
		},
		"Alacritty": {
			candidate: "alacritty",
			expected:  []string{"-e", "sh", script},
		},
		"Kitty": {
			candidate: "kitty",
			expected:  []string{"sh", script},
		},
		"Ghostty": {
			candidate: "ghostty",
			expected:  []string{"-e", "sh", script},
		},
		"WezTerm": {
			candidate: "wezterm",
			expected:  []string{"start", "--", "sh", script},
		},
		"Foot": {
			candidate: "foot",
			expected:  []string{"sh", script},
		},
		"Default Terminal": {
			candidate: "x-terminal-emulator",
			expected:  []string{"-e", "sh " + script},
		},
	}

	for name, test := range invocationTests {
		t.Run(name, func(t *testing.T) {
			candidate, found := findCandidate(linuxTerminals, test.candidate)
			require.True(t, found, test.candidate)
			require.NotEmpty(t, candidate.invocations, test.candidate)

			actual := expandInvocation(candidate.invocations[0], launchContext{script: script})
			require.Equal(t, test.expected, actual, test.candidate)
		})
	}
}

func TestMergeExtraArgs(t *testing.T) {
	inv := invocation{args: []string{"start", "--", "sh", "{cmd}"}}

	// The invocation already provides the extra arguments.
	require.Nil(t, mergeExtraArgs(inv, []string{"start", "--"}))
	// The extra arguments are not part of the invocation.
	require.Equal(t, []string{"--title", "foo"}, mergeExtraArgs(inv, []string{"--title", "foo"}))
	// No extra arguments.
	require.Nil(t, mergeExtraArgs(inv, nil))
}

func TestLaunchPreferredUsesTheSelectedTerminal(t *testing.T) {
	dir := makeStubTerminal(t, "alacritty", "ghostty")
	t.Setenv("PATH", dir)
	argsFile := filepath.Join(t.TempDir(), "args.txt")
	t.Setenv("STUB_ARGS_FILE", argsFile)

	const script = "/tmp/run.sh"
	require.NoError(t, launchPreferred("alacritty", linuxTerminals, &launchContext{script: script}))

	recorded, err := os.ReadFile(argsFile)
	require.NoError(t, err)
	require.Equal(t, "-e sh "+script, strings.TrimSpace(string(recorded)))
}

func TestLaunchPreferredFallsBackToTheNextInvocation(t *testing.T) {
	dir := makeStubTerminal(t, "alacritty")
	t.Setenv("PATH", dir)
	argsFile := filepath.Join(t.TempDir(), "args.txt")
	t.Setenv("STUB_ARGS_FILE", argsFile)
	// The first invocation of alacritty is not supported by the stub.
	t.Setenv("STUB_FAIL_ON", "-e")

	const script = "/tmp/run.sh"
	require.NoError(t, launchPreferred("alacritty", linuxTerminals, &launchContext{script: script}))

	recorded, err := os.ReadFile(argsFile)
	require.NoError(t, err)
	require.Equal(t, "-- sh "+script, strings.TrimSpace(string(recorded)))
}

func TestLaunchPreferredWithCustomCommand(t *testing.T) {
	dir := makeStubTerminal(t, "myterminal")
	t.Setenv("PATH", dir)
	argsFile := filepath.Join(t.TempDir(), "args.txt")
	t.Setenv("STUB_ARGS_FILE", argsFile)

	const script = "/tmp/run.sh"
	require.NoError(t, launchPreferred("myterminal", linuxTerminals, &launchContext{script: script}))

	recorded, err := os.ReadFile(argsFile)
	require.NoError(t, err)
	require.Equal(t, "-e sh "+script, strings.TrimSpace(string(recorded)))
}

func TestLaunchPreferredWithUnknownTerminal(t *testing.T) {
	t.Setenv("PATH", t.TempDir())

	require.Error(t, launchPreferred("this-terminal-does-not-exist", linuxTerminals, &launchContext{script: "/tmp/run.sh"}))
}

func TestLaunchPreferredWithCustomCommandWithArguments(t *testing.T) {
	dir := makeStubTerminal(t, "wezterm")
	t.Setenv("PATH", dir)
	argsFile := filepath.Join(t.TempDir(), "args.txt")
	t.Setenv("STUB_ARGS_FILE", argsFile)

	const script = "/tmp/run.sh"
	// The arguments of the terminal are not repeated: wezterm already runs
	// "start --".
	require.NoError(t, launchPreferred("wezterm start --", linuxTerminals, &launchContext{script: script}))

	recorded, err := os.ReadFile(argsFile)
	require.NoError(t, err)
	require.Equal(t, "start -- sh "+script, strings.TrimSpace(string(recorded)))
}

func TestLaunchPreferredWithCustomCommandWithExtraArguments(t *testing.T) {
	dir := makeStubTerminal(t, "wezterm")
	t.Setenv("PATH", dir)
	argsFile := filepath.Join(t.TempDir(), "args.txt")
	t.Setenv("STUB_ARGS_FILE", argsFile)

	const script = "/tmp/run.sh"
	// The arguments of the user are added in front of the ones of the
	// terminal.
	require.NoError(t, launchPreferred("wezterm --title foo", linuxTerminals, &launchContext{script: script}))

	recorded, err := os.ReadFile(argsFile)
	require.NoError(t, err)
	require.Equal(t, "--title foo start -- sh "+script, strings.TrimSpace(string(recorded)))
}

func TestLaunchPreferredWithInvalidCustomCommand(t *testing.T) {
	t.Setenv("PATH", t.TempDir())

	// A line break would split the command in two.
	require.Error(t, launchPreferred("sh\n--title foo", linuxTerminals, &launchContext{script: "/tmp/run.sh"}))
}

func TestOpenTerminalFallsBackToTheAutomaticDetection(t *testing.T) {
	dir := makeStubTerminal(t, "alacritty")
	t.Setenv("PATH", dir)
	t.Setenv("STUB_FAIL_ON", "-e")
	t.Setenv("STUB_ARGS_FILE", filepath.Join(t.TempDir(), "args.txt"))

	require.NoError(t, openTerminal(Options{}, "echo", "hello"))
}

func TestOpenTerminalWithoutTerminals(t *testing.T) {
	t.Setenv("PATH", t.TempDir())

	err := openTerminal(Options{}, "echo", "hello")
	require.Error(t, err)
	require.Contains(t, err.Error(), "no terminal emulator found")
}

func TestCreateWrapperScript(t *testing.T) {
	scriptPath, err := createWrapperScript([]string{"adb", "-s", "1234", "shell"})
	require.NoError(t, err)
	t.Cleanup(func() { os.RemoveAll(filepath.Dir(scriptPath)) })

	require.True(t, strings.HasPrefix(filepath.Dir(scriptPath), os.TempDir()))
	require.Equal(t, "run.sh", filepath.Base(scriptPath))

	content, err := os.ReadFile(scriptPath)
	require.NoError(t, err)
	require.Contains(t, string(content), "adb -s 1234 shell")
	// The script removes itself when it terminates.
	require.Contains(t, string(content), `rm -f "$0"`)

	info, err := os.Stat(scriptPath)
	require.NoError(t, err)
	require.Equal(t, os.FileMode(0700), info.Mode().Perm())
}

func TestCreateWrapperScriptQuotesTheArguments(t *testing.T) {
	scriptPath, err := createWrapperScript([]string{"/opt/my tools/adb", "shell"})
	require.NoError(t, err)
	t.Cleanup(func() { os.RemoveAll(filepath.Dir(scriptPath)) })

	content, err := os.ReadFile(scriptPath)
	require.NoError(t, err)
	require.Contains(t, string(content), "'/opt/my tools/adb' shell")
}
