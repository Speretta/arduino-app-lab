//go:build windows

package terminal

// Test with:
// cd standalone-apps/app-lab-desktop
// go test -v ./internal/terminal

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestExpandInvocation(t *testing.T) {
	const script = `C:\Users\test\AppData\Local\Temp\app-lab-terminal-123\run.cmd`

	var invocationTests = map[string]struct {
		candidate string
		expected  []string
	}{
		"Windows Terminal": {
			candidate: "wt.exe",
			expected:  []string{"-w", "new", "cmd.exe", "/C", script},
		},
		"Command Prompt": {
			candidate: "cmd.exe",
			expected:  []string{"/C", script},
		},
		"Windows PowerShell": {
			candidate: "powershell.exe",
			expected:  []string{"-Command", "& '" + script + "'"},
		},
		"ConEmu": {
			candidate: "ConEmu64.exe",
			expected:  []string{"-RunAs", "/cmd", script},
		},
		"Tabby": {
			candidate: "tabby.exe",
			expected:  []string{"run", script},
		},
		"Alacritty": {
			candidate: "alacritty.exe",
			expected:  []string{"-e", "cmd.exe", "/C", script},
		},
	}

	for name, test := range invocationTests {
		t.Run(name, func(t *testing.T) {
			candidate, found := findCandidate(windowsTerminals, test.candidate)
			require.True(t, found, test.candidate)
			require.NotEmpty(t, candidate.invocations, test.candidate)

			actual := expandInvocation(candidate.invocations[0], launchContext{script: script})
			require.Equal(t, test.expected, actual, test.candidate)
		})
	}
}

func TestExpandInvocationWithTheRawCommand(t *testing.T) {
	const script = `C:\Users\test\AppData\Local\Temp\app-lab-terminal-123\run.cmd`

	candidate, found := findCandidate(windowsTerminals, "wsl.exe")
	require.True(t, found)
	require.True(t, candidate.rawCommand, "wsl runs the command with its own shell")

	// The command is resolved inside the distribution, the executable is
	// searched by its name.
	ctx := launchContext{
		command: []string{`C:\Program Files\adb\adb.exe`, "-s", "1234", "shell"},
		script:  script,
		raw:     true,
	}
	actual := expandInvocation(candidate.invocations[0], ctx)
	require.Equal(t, []string{"--", "sh", "-c", "adb -s 1234 shell"}, actual)
}

func TestRemoteCommand(t *testing.T) {
	require.Equal(t,
		[]string{"adb", "-s", "1234", "shell"},
		remoteCommand([]string{`C:\Program Files\adb\adb.exe`, "-s", "1234", "shell"}))
	require.Equal(t,
		[]string{"ssh", "arduino@192.168.1.2"},
		remoteCommand([]string{"ssh", "arduino@192.168.1.2"}))
	require.Empty(t, remoteCommand(nil))
}

func TestScriptContent(t *testing.T) {
	content := scriptContent([]string{`C:\Program Files\adb\adb.exe`, "-s", "1234", "shell"})

	require.Contains(t, content, "@echo off")
	require.Contains(t, content, `"C:\Program Files\adb\adb.exe" -s 1234 shell`)
	require.Contains(t, content, "pause >nul")
}

func TestQuoteWindowsArg(t *testing.T) {
	require.Equal(t, "adb", quoteWindowsArg("adb"))
	require.Equal(t, `"C:\Program Files\adb.exe"`, quoteWindowsArg(`C:\Program Files\adb.exe`))
	require.Equal(t, `""`, quoteWindowsArg(""))
}
