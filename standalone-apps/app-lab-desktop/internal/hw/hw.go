package hw

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"

	"github.com/arduino/arduino-app-cli/pkg/board"
	"github.com/arduino/arduino-app-cli/pkg/board/remote"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"go.bug.st/f"
)

var linuxConfigCommand = "arduino-linux-config"

func Supported(ctx context.Context, conn remote.RemoteConn) bool {
	// `command` is a shell builtin, and the local connection runs programs without a shell.
	cmd := conn.GetCmd("sh", "-c", "command -v "+linuxConfigCommand)
	_, err := cmd.Output(ctx)
	return err == nil
}

func Available(ctx context.Context, conn remote.RemoteConn) bool {
	cmd := conn.GetCmd(linuxConfigCommand, "hw")
	_, err := cmd.Output(ctx)
	return err == nil
}

type ListResult struct {
	Mounts []ListMount `json:"mounts"`
}

type ListMount struct {
	Name      string       `json:"name"`
	Kind      string       `json:"kind"`
	Devices   []ListDevice `json:"devices"`
	OsSupport bool         `json:"os_support"`
}

type ListDevice struct {
	Name       string   `json:"name"`
	DeviceType string   `json:"device_type"`
	Options    []string `json:"options"`
	OsSupport  bool     `json:"os_support"`
}

func List(ctx context.Context, conn remote.RemoteConn) (ListResult, error) {
	cmd := conn.GetCmd(linuxConfigCommand, "hw", "list", "--format", "json")
	out, err := cmd.Output(ctx)
	if err != nil {
		return ListResult{}, fmt.Errorf("output failed: %w", err)
	}
	runtime.LogInfo(ctx, fmt.Sprintf("Hardware mount list output: %s", string(out)))

	var response ListResult
	if err := json.Unmarshal(out, &response); err != nil {
		return ListResult{}, fmt.Errorf("failed to parse JSON: %w\noutput: %s", err, string(out))
	}

	return response, nil
}

type ShowResult struct {
	Mounts []ShowMount `json:"mounts"`
}

type ShowMount struct {
	Name           string       `json:"name"`
	Kind           string       `json:"kind"`
	CurrentEnabled bool         `json:"current_enabled"`
	NextEnabled    bool         `json:"next_enabled"`
	CurrentDevices []ShowDevice `json:"current"`
	NextDevices    []ShowDevice `json:"next"`
}

type ShowDevice struct {
	Device     string `json:"device"`
	Option     string `json:"option"`
	DeviceType string `json:"device_type"`
}

func Show(ctx context.Context, conn remote.RemoteConn) (ShowResult, error) {
	cmd := conn.GetCmd(linuxConfigCommand, "hw", "show", "--format", "json")
	out, err := cmd.Output(ctx)
	if err != nil {
		return ShowResult{}, fmt.Errorf("output failed: %w", err)
	}
	runtime.LogInfo(ctx, fmt.Sprintf("Hardware mount show output: %s", string(out)))

	var response ShowResult
	if err := json.Unmarshal(out, &response); err != nil {
		return ShowResult{}, fmt.Errorf("failed to parse JSON: %w\noutput: %s", err, string(out))
	}

	return response, nil
}

// Stable error codes returned to the frontend. Keep in sync with HwErrorCode in settings.type.ts.
const (
	ErrCodeIncorrectPassword = "ERR_HW_INCORRECT_PASSWORD"
	ErrCodeCommandFailed     = "ERR_HW_COMMAND_FAILED"
)

// HwError is returned by Enable and Disable, and sent to the frontend as JSON.
type HwError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e *HwError) Error() string {
	return e.Message
}

// sudo exits with 1 for a wrong password, like a failing command, so the output
// tells the two apart. The board ships only the en_US locale, so sudo always
// prints this text in English.
const sudoIncorrectPassword = "incorrect password attempt"

// hwErrorFromOutput turns a failed board.ExecAsRoot into an HwError when the
// output says why. board.ExecAsRoot returns stdout and stderr together.
func hwErrorFromOutput(out []byte, err error) error {
	out = bytes.TrimSpace(out)
	if bytes.Contains(out, []byte(sudoIncorrectPassword)) {
		return &HwError{Code: ErrCodeIncorrectPassword, Message: string(out)}
	}
	// arduino-linux-config reports a failure on stderr as {"error": "..."}.
	var result struct {
		Error string `json:"error"`
	}
	if json.Unmarshal(out, &result) == nil && result.Error != "" {
		return &HwError{Code: ErrCodeCommandFailed, Message: result.Error}
	}
	return fmt.Errorf("%w: %s", err, out)
}

func ExecAsRoot(conn remote.RemoteConn, password string, args ...string) error {
	out, err := board.ExecAsRoot(conn, password, args...)
	if err != nil {
		return hwErrorFromOutput(out, err)
	}
	return nil
}

func Disable(ctx context.Context, conn remote.RemoteConn, password string, name string) error {
	args := []string{linuxConfigCommand, "hw", "disable", name, "--format", "json"}

	runtime.LogInfo(ctx, fmt.Sprintf("Disabling hardware mount %s with args: %v", name, args))

	if err := ExecAsRoot(conn, password, args...); err != nil {
		return fmt.Errorf("failed to exec disable command: %w", err)
	}
	return nil
}

type EnableDeviceConfig struct {
	Device string
	Option string
}

func Enable(ctx context.Context, conn remote.RemoteConn, password string, name string, configuration []EnableDeviceConfig) error {
	args := []string{linuxConfigCommand, "hw", "enable", name}
	args = append(args, f.Map(configuration, func(d EnableDeviceConfig) string {
		return fmt.Sprintf("%s=%s", d.Device, d.Option)
	})...)
	args = append(args, "--format", "json")

	runtime.LogInfo(ctx, fmt.Sprintf("Enabling hardware mount %s with args: %v", name, args))

	if err := ExecAsRoot(conn, password, args...); err != nil {
		return fmt.Errorf("failed to exec enable command: %w", err)
	}
	return nil
}
