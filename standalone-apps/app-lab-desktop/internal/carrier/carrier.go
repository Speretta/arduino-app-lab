package carrier

import (
	"app-lab-desktop/internal/hw"
	"context"
	"encoding/json"
	"fmt"

	"github.com/arduino/arduino-app-cli/pkg/board/remote"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"go.bug.st/f"
)

var linuxConfigCommand = "arduino-linux-config"

type CarrierResponse struct {
	Carriers []Carrier `json:"carriers"`
}

type Carrier struct {
	Name    string         `json:"name"`
	Devices []DeviceResult `json:"devices"`
}

type DeviceResult struct {
	Name             string   `json:"name"`
	DeviceType       string   `json:"device_type"`
	AvailableDevices []string `json:"available_devices"`
}

func List(ctx context.Context, conn remote.RemoteConn) (CarrierResponse, error) {
	cmd := conn.GetCmd(linuxConfigCommand, "carrier", "list", "--format", "json")
	out, err := cmd.Output(ctx)
	if err != nil {
		return CarrierResponse{}, fmt.Errorf("output failed: %w", err)
	}
	runtime.LogInfo(ctx, fmt.Sprintf("Carrier list output: %s", string(out)))

	var response CarrierResponse
	if err := json.Unmarshal(out, &response); err != nil {
		return CarrierResponse{}, fmt.Errorf("failed to parse JSON: %w\noutput: %s", err, string(out))
	}

	return response, nil
}

type ShowResult struct {
	Carriers []ShowCarrierResult `json:"carriers"`
}

type ShowCarrierResult struct {
	CarrierName    string               `json:"carrier_name"`
	CurrentEnabled bool                 `json:"current_enabled"`
	NextEnabled    bool                 `json:"next_enabled"`
	CurrentDevices []StatusDeviceResult `json:"current"`
	NextDevices    []StatusDeviceResult `json:"next"`
}

type StatusDeviceResult struct {
	Device     string `json:"device"`
	Option     string `json:"option"`
	DeviceType string `json:"device_type"`
}

func Show(ctx context.Context, conn remote.RemoteConn) (ShowResult, error) {
	cmd := conn.GetCmd(linuxConfigCommand, "carrier", "show", "--format", "json")
	out, err := cmd.Output(ctx)
	if err != nil {
		return ShowResult{}, fmt.Errorf("output failed: %w", err)
	}
	runtime.LogInfo(ctx, fmt.Sprintf("Carrier show output: %s", string(out)))

	var response ShowResult
	if err := json.Unmarshal(out, &response); err != nil {
		return ShowResult{}, fmt.Errorf("failed to parse JSON: %w\noutput: %s", err, string(out))
	}

	return response, nil
}

func Disable(ctx context.Context, conn remote.RemoteConn, password string, carrier string) error {
	args := []string{linuxConfigCommand, "carrier", "disable", carrier, "--format", "json"}

	runtime.LogInfo(ctx, fmt.Sprintf("Disabling carrier %s with args: %v", carrier, args))

	if err := hw.ExecAsRoot(conn, password, args...); err != nil {
		return fmt.Errorf("failed to start: %w", err)
	}

	return nil
}

type EnableDeviceConfig struct {
	Device string
	Option string
}

func Enable(ctx context.Context, conn remote.RemoteConn, password string, carrier string, configuration []EnableDeviceConfig) error {
	args := []string{linuxConfigCommand, "carrier", "enable", carrier}
	args = append(args, f.Map(configuration, func(d EnableDeviceConfig) string {
		return fmt.Sprintf("%s=%s", d.Device, d.Option)
	})...)
	args = append(args, "--format", "json")

	runtime.LogInfo(ctx, fmt.Sprintf("Enabling carrier %s with args: %v", carrier, args))

	if err := hw.ExecAsRoot(conn, password, args...); err != nil {
		return fmt.Errorf("failed to start: %w", err)
	}

	return nil
}
