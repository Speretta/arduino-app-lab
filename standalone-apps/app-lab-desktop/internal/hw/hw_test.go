package hw

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/arduino/arduino-app-cli/pkg/board/remote/local"
)

// In SBC mode App Lab reaches the board through a local connection, which runs programs without
// a shell. PATH holds only `sh` and, when installed, the CLI, so no `command` program is found.
func TestSupportedOnLocalConnection(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("the local connection is only used on the board, which runs Linux")
	}
	sh, err := exec.LookPath("sh")
	if err != nil {
		t.Fatal(err)
	}

	for _, installed := range []bool{true, false} {
		dir := t.TempDir()
		if err := os.Symlink(sh, filepath.Join(dir, "sh")); err != nil {
			t.Fatal(err)
		}
		if installed {
			if err := os.WriteFile(filepath.Join(dir, linuxConfigCommand), []byte("#!/bin/sh\n"), 0o755); err != nil {
				t.Fatal(err)
			}
		}
		t.Setenv("PATH", dir)

		if got := Supported(context.Background(), &local.LocalConnection{}); got != installed {
			t.Errorf("installed=%v: Supported() = %v", installed, got)
		}
	}
}

func TestHwErrorFromOutput(t *testing.T) {
	exitErr := errors.New("command failed: exit status 1")

	// Outputs printed on the board by sudo and by arduino-linux-config.
	tests := []struct {
		name string
		out  string
		code string
	}{
		{"wrong password", "Sorry, try again.\n\nsudo: no password was provided\nsudo: 1 incorrect password attempt\n", ErrCodeIncorrectPassword},
		{"command error", "{\n  \"error\": \"Command 'enable' must be run as root\"\n}\n", ErrCodeCommandFailed},
		{"other output", "something else\n", ""},
		{"no output", "", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := hwErrorFromOutput([]byte(tt.out), exitErr)
			var hwErr *HwError
			isHwErr := errors.As(err, &hwErr)
			switch {
			case tt.code == "" && isHwErr:
				t.Errorf("got HwError %v, want a plain error", hwErr)
			case tt.code == "" && !errors.Is(err, exitErr):
				t.Errorf("got %v, want it to wrap the exit error", err)
			case tt.code != "" && (!isHwErr || hwErr.Code != tt.code):
				t.Errorf("got %v, want HwError with code %s", err, tt.code)
			}
		})
	}

	err := hwErrorFromOutput([]byte("{\"error\": \"hat not found\"}"), exitErr)
	var hwErr *HwError
	if !errors.As(err, &hwErr) || hwErr.Message != "hat not found" {
		t.Errorf("got %v, want message \"hat not found\"", err)
	}
}
