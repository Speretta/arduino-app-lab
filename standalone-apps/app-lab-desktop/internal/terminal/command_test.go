package terminal

// Test with:
// cd standalone-apps/app-lab-desktop
// go test -v ./internal/terminal

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSplitCommand(t *testing.T) {
	var splitCommandTests = map[string]struct {
		input       string
		expected    []string
		expectError bool
	}{
		"Empty": {
			input:    "",
			expected: []string{},
		},
		"Simple Command": {
			input:    "alacritty",
			expected: []string{"alacritty"},
		},
		"Command With Arguments": {
			input:    "wezterm start --",
			expected: []string{"wezterm", "start", "--"},
		},
		"Extra Spaces": {
			input:    "  wezterm   start  ",
			expected: []string{"wezterm", "start"},
		},
		"Double Quoted Argument": {
			input:    `alacritty --title "My Terminal"`,
			expected: []string{"alacritty", "--title", "My Terminal"},
		},
		"Single Quoted Argument": {
			input:    `alacritty --title 'My Terminal'`,
			expected: []string{"alacritty", "--title", "My Terminal"},
		},
		"Quoted Argument With Spaces": {
			input:    `"/usr/bin/my terminal"`,
			expected: []string{"/usr/bin/my terminal"},
		},
		"Unterminated Quote": {
			input:       `alacritty --title "My Terminal`,
			expectError: true,
		},
	}

	for name, test := range splitCommandTests {
		t.Run(name, func(t *testing.T) {
			actual, err := splitCommand(test.input)
			if test.expectError {
				require.Error(t, err, name)
				return
			}
			require.NoError(t, err, name)
			require.Equal(t, test.expected, actual, name)
		})
	}
}

func TestShellQuote(t *testing.T) {
	var shellQuoteTests = map[string]struct {
		input    string
		expected string
	}{
		"Simple Word": {
			input:    "alacritty",
			expected: "alacritty",
		},
		"Path With Slash": {
			input:    "/usr/bin/alacritty",
			expected: "/usr/bin/alacritty",
		},
		"Empty String": {
			input:    "",
			expected: "''",
		},
		"Word With Space": {
			input:    "my terminal",
			expected: "'my terminal'",
		},
		"Word With Single Quote": {
			input:    "it's",
			expected: `'it'\''s'`,
		},
		"Word With Double Quote": {
			input:    `say "hi"`,
			expected: `'say "hi"'`,
		},
		"Word With Dollar": {
			input:    "$HOME",
			expected: "'$HOME'",
		},
		"Command Injection Attempt": {
			input:    "foo; rm -rf /",
			expected: "'foo; rm -rf /'",
		},
	}

	for name, test := range shellQuoteTests {
		t.Run(name, func(t *testing.T) {
			require.Equal(t, test.expected, shellQuote(test.input), name)
		})
	}
}

func TestShellQuoteAll(t *testing.T) {
	require.Equal(t, "adb -s 1234 shell", shellQuoteAll([]string{"adb", "-s", "1234", "shell"}))
	require.Equal(t, "'/opt/my tools/adb' shell", shellQuoteAll([]string{"/opt/my tools/adb", "shell"}))
}

func TestValidateCommand(t *testing.T) {
	t.Run("Empty Command", func(t *testing.T) {
		require.Error(t, ValidateCommand(""))
	})

	t.Run("Not Existing Terminal", func(t *testing.T) {
		require.Error(t, ValidateCommand("this-terminal-does-not-exist"))
	})

	t.Run("Existing Terminal", func(t *testing.T) {
		// "sh" is available on every unix system.
		require.NoError(t, ValidateCommand("sh"))
	})

	t.Run("Unterminated Quote", func(t *testing.T) {
		require.Error(t, ValidateCommand(`sh "unterminated`))
	})
}
