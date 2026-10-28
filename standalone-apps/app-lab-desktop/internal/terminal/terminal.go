package terminal

import (
	"app-lab-desktop/internal/board"
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"

	oBoard "github.com/arduino/arduino-app-cli/pkg/board"

	"github.com/arduino/arduino-app-cli/pkg/board/remote/adb"
	"github.com/arduino/go-paths-helper"
)

// Options customizes the way the terminal is opened.
type Options struct {
	// PreferredTerminal is the terminal emulator selected by the user:
	//   ""           automatic, the first supported terminal found on the system is used
	//   "<id>"      the id of a terminal reported by ListAvailable (e.g. "alacritty")
	//   "<command>" a custom command used to launch the terminal (e.g. "wezterm start --")
	// An empty value is also used when the selected terminal can not be started,
	// in that case the automatic detection is used as fallback.
	PreferredTerminal string
}

func OpenTerminal(ctx context.Context, b *board.Board, opts Options) error {
	if b == nil {
		return fmt.Errorf("no board selected")
	}

	switch b.Info.Protocol {
	case oBoard.SerialProtocol:
		validSerial, err := SanitizeSerialNumber(b.Info.Serial)
		if err != nil {
			return fmt.Errorf("invalid board serial port: %v", err)
		}
		err = openTerminalWithArgs(ctx, opts, []string{adb.FindAdbPath(), "-s", validSerial, "shell"}...)
		if err != nil {
			return err
		}
	case oBoard.NetworkProtocol:
		validAddress, err := SanitizeIPAddress(b.Info.Address)
		if err != nil {
			return fmt.Errorf("invalid board address: %v", err)
		}
		err = openTerminalWithArgs(ctx, opts, []string{"ssh", fmt.Sprintf("arduino@%s", validAddress)}...)
		if err != nil {
			return err
		}
	default:
		return fmt.Errorf("open terminal not supported for protocol %s", b.Info.Protocol)
	}

	return nil
}

func openTerminalWithArgs(ctx context.Context, opts Options, args ...string) error {
	runtimeOs := runtime.GOOS
	switch runtimeOs {
	case "windows":
		cmdArgs := append([]string{"cmd.exe", "/C", "start", "cmd.exe", "/K"}, args...)
		cmd, err := paths.NewProcess(nil, cmdArgs...)
		if err != nil {
			slog.Error("failed to start cmd.exe terminal", "err", err, "args", cmdArgs)
			return errors.New("fail to open terminal")
		}
		slog.Info("Opening terminal", "cmd", cmd.GetArgs())
		stdout, err := cmd.RunAndCaptureCombinedOutput(context.Background())
		if err != nil {
			slog.Error("failed to start terminal", "err", err, "cmd", cmd.GetArgs(), "output", string(stdout))
			return errors.New("fail to start terminal")
		}
	case "darwin":
		tmpScript := filepath.Join(os.TempDir(), "run_in_terminal.sh")
		scriptContent := fmt.Sprintf("#!/bin/sh\n%s", strings.Join(args, " "))
		err := os.WriteFile(tmpScript, []byte(scriptContent), 0700)
		if err != nil {
			slog.Error("failed to write file", "err", err, "path", tmpScript)
			return errors.New("fail to prepare opening terminal")
		}
		cmd, err := paths.NewProcess(nil, "open", "-a", "Terminal", tmpScript)
		if err != nil {
			slog.Error("failed to open terminal", "err", err, "path", tmpScript)
			return errors.New("fail to open terminal")
		}
		slog.Info("Opening terminal", "cmd", cmd.GetArgs())
		stdout, err := cmd.RunAndCaptureCombinedOutput(context.Background())
		if err != nil {
			slog.Error("failed to run terminal", "err", err, "cmd", cmd.GetArgs(), "output", string(stdout))
			return errors.New("fail to run terminal")
		}
	case "linux":
		return openLinuxTerminal(opts, args...)
	default:
		return fmt.Errorf("unsupported OS: %s", runtimeOs)
	}
	return nil
}

func SanitizeIPAddress(address string) (string, error) {
	if sanitized := net.ParseIP(address); sanitized != nil {
		return address, nil
	}
	return "", fmt.Errorf("invalid IP address")
}

func SanitizeSerialNumber(serial string) (string, error) {
	if _, err := strconv.ParseUint(serial, 10, 32); err != nil {
		return "", fmt.Errorf("invalid serial number")
	}
	return serial, nil
}
