package app

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestTerminalPreference(t *testing.T) {
	// The app data root is resolved from the XDG_DATA_HOME on linux.
	t.Setenv("XDG_DATA_HOME", t.TempDir())

	require.Empty(t, readTerminalPreference(), "the preference is empty when it has not been set")

	require.NoError(t, writeTerminalPreference("alacritty"))
	require.Equal(t, "alacritty", readTerminalPreference())

	require.NoError(t, writeTerminalPreference(""))
	require.Empty(t, readTerminalPreference())
}

func TestTerminalPreferenceFile(t *testing.T) {
	appDataDir := t.TempDir()
	t.Setenv("XDG_DATA_HOME", appDataDir)

	require.NoError(t, writeTerminalPreference("ghostty"))

	path := filepath.Join(appDataDir, "arduino-app-lab", "terminal-settings.json")
	content, err := os.ReadFile(path)
	require.NoError(t, err)
	require.Contains(t, string(content), "ghostty")
}

func TestSetTerminalPreference(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())

	// A terminal that does not exist is rejected.
	require.Error(t, setTerminalPreference("this-terminal-does-not-exist"))
	require.Empty(t, readTerminalPreference())

	// An empty value restores the automatic detection.
	require.NoError(t, setTerminalPreference(""))
	require.Empty(t, readTerminalPreference())

	// "sh" is available on every unix system.
	require.NoError(t, setTerminalPreference("sh"))
	require.Equal(t, "sh", readTerminalPreference())
}
