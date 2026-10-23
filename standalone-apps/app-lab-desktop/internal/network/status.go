package network

import (
	"context"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/arduino/arduino-app-cli/pkg/board/remote"
)

type Status string

var (
	ConnectedStatus    Status = "connected"
	ConnectingStatus   Status = "connecting"
	DisconnectedStatus Status = "disconnected"
)

// NetworkStatus is every answer the status poll needs.
type NetworkStatus struct {
	WiFi     Status `json:"wifi"`
	Ethernet Status `json:"ethernet"`
	Internet bool   `json:"internet"`
}

// GetNetworkStatus answers the whole poll over one SSH session: the frontend
// asks every 3 seconds and the board's sshd allows 10 sessions in total.
func GetNetworkStatus(ctx context.Context, conn remote.RemoteConn) (NetworkStatus, error) {
	if conn == nil {
		return NetworkStatus{}, fmt.Errorf("missing connection")
	}

	// Only the device query sets the exit status, so a failed connectivity check
	// reads as offline and keeps the device states. The check asks
	// NetworkManager for a new probe, so it runs only when a device is
	// connected. Its verdict is prefixed because nmcli prints it bare.
	const script = `devices=$(nmcli -t -f TYPE,STATE device) || exit
printf '%s\n' "$devices"
if printf '%s\n' "$devices" | grep -qx -e wifi:connected -e ethernet:connected; then
	printf 'connectivity:'
	nmcli networking connectivity check || true
fi`

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	out, err := conn.GetCmd("sh", "-c", script).Output(ctx)
	if err != nil {
		return NetworkStatus{}, fmt.Errorf("failed to query network status: %w", err)
	}

	return NetworkStatus{
		WiFi:     deviceStatus(string(out), "wifi"),
		Ethernet: deviceStatus(string(out), "ethernet"),
		Internet: strings.Contains(string(out), "connectivity:full"),
	}, nil
}

func GetConnectionName(ctx context.Context, conn remote.RemoteConn) (*string, error) {
	if conn == nil {
		return nil, fmt.Errorf("missing connection")
	}
	nm := &Manager{
		Timeout: 5 * time.Second,
		Conn:    conn,
	}
	// -t = terse, -f = columns NAME
	out, err := nm.Run(ctx, "-t", "-f", "NAME", "connection", "show", "--active")
	if err != nil {
		return nil, fmt.Errorf("failed to query connection: %w", err)
	}
	parts := strings.Split(out, "\n")
	if len(parts) == 0 || strings.TrimSpace(parts[0]) == "" {
		return nil, nil
	}
	name := strings.TrimSpace(parts[0])
	return &name, nil
}

func (nm *Manager) getIPAddress(ctx context.Context) (*string, error) {
	out, err := nm.Run(ctx, "-g", "GENERAL.TYPE,IP4.ADDRESS", "device", "show")
	if err != nil {
		return nil, fmt.Errorf("failed to query ip address: %w", err)
	}

	type networkIP struct {
		Type string
		IP   string
	}
	var networksIPs []networkIP
	for _, group := range strings.Split(out, "\n\n") {
		parts := strings.Split(group, "\n")
		if len(parts) < 2 {
			continue
		}
		netType := strings.TrimSpace(parts[0])

		ip := strings.TrimSpace(parts[1])
		parts = strings.Split(ip, "/")
		if len(parts) == 0 || strings.TrimSpace(parts[0]) == "" {
			continue
		}
		ip = strings.TrimSpace(parts[0])

		networksIPs = append(networksIPs, networkIP{
			Type: netType,
			IP:   ip,
		})
	}

	if idx := slices.IndexFunc(networksIPs, func(n networkIP) bool {
		return n.Type == "ethernet"
	}); idx != -1 {
		return &networksIPs[idx].IP, nil
	}

	if idx := slices.IndexFunc(networksIPs, func(n networkIP) bool {
		return n.Type == "wifi"
	}); idx != -1 {
		return &networksIPs[idx].IP, nil
	}

	return nil, fmt.Errorf("no IP address found for ethernet or wifi connections")
}

func GetIPAddress(ctx context.Context, conn remote.RemoteConn) (*string, error) {
	if conn == nil {
		return nil, fmt.Errorf("missing connection")
	}
	nm := &Manager{
		Timeout: 5 * time.Second,
		Conn:    conn,
	}
	return nm.getIPAddress(ctx)
}

func deviceStatus(out string, netType string) Status {
	for _, line := range strings.Split(out, "\n") {
		parts := strings.Split(line, ":")
		if len(parts) != 2 {
			continue
		}
		if parts[0] == netType && strings.TrimSpace(parts[1]) == "connected" {
			return ConnectedStatus
		}

		if parts[0] == netType && strings.TrimSpace(parts[1]) == "connecting" {
			return ConnectingStatus
		}
	}
	return DisconnectedStatus
}
