package network

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/arduino/arduino-app-cli/pkg/board/remote"
)

func TestGetNetworkStatus(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("the status script needs sh")
	}

	for _, tc := range []struct {
		name         string
		devices      string
		devicesFail  bool
		connectivity string
		checkFail    bool
		want         NetworkStatus
		wantErr      bool
		wantCheck    bool
	}{
		{
			name:         "wifi up and online",
			devices:      "wifi:connected\nethernet:disconnected\n",
			connectivity: "full",
			want:         NetworkStatus{WiFi: ConnectedStatus, Ethernet: DisconnectedStatus, Internet: true},
			wantCheck:    true,
		},
		{
			name:         "ethernet up, no internet",
			devices:      "wifi:disconnected\nethernet:connected\n",
			connectivity: "limited",
			want:         NetworkStatus{WiFi: DisconnectedStatus, Ethernet: ConnectedStatus, Internet: false},
			wantCheck:    true,
		},
		{
			name:         "wifi associating",
			devices:      "wifi:connecting\nethernet:unavailable\n",
			connectivity: "full",
			want:         NetworkStatus{WiFi: ConnectingStatus, Ethernet: DisconnectedStatus, Internet: false},
		},
		{
			name:         "no wifi or ethernet connected",
			devices:      "wifi:disconnected\nwifi-p2p:connected\nloopback:connected (externally)\n",
			connectivity: "full",
			want:         NetworkStatus{WiFi: DisconnectedStatus, Ethernet: DisconnectedStatus, Internet: false},
		},
		{
			name:      "connectivity check fails",
			devices:   "wifi:connected\nethernet:disconnected\n",
			checkFail: true,
			want:      NetworkStatus{WiFi: ConnectedStatus, Ethernet: DisconnectedStatus, Internet: false},
			wantCheck: true,
		},
		{
			name:        "device query fails",
			devicesFail: true,
			wantErr:     true,
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			if err := os.WriteFile(filepath.Join(dir, "nmcli"), []byte(fakeNmcli), 0o755); err != nil {
				t.Fatal(err)
			}
			checkLog := filepath.Join(dir, "check.log")
			conn := &fakeConn{env: append(os.Environ(),
				"PATH="+dir+string(os.PathListSeparator)+os.Getenv("PATH"),
				"FAKE_LOG="+checkLog,
				"FAKE_DEVICES="+tc.devices,
				"FAKE_DEVICES_FAIL="+flag(tc.devicesFail),
				"FAKE_CONNECTIVITY="+tc.connectivity,
				"FAKE_CHECK_FAIL="+flag(tc.checkFail),
			)}

			got, err := GetNetworkStatus(context.Background(), conn)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("status = %+v, want an error", got)
				}
			} else {
				if err != nil {
					t.Fatalf("GetNetworkStatus: %v", err)
				}
				if got != tc.want {
					t.Fatalf("status = %+v, want %+v", got, tc.want)
				}
			}
			// The board's sshd allows 10 sessions and this poll runs every 3s.
			if conn.calls != 1 {
				t.Fatalf("GetCmd calls = %d, want 1", conn.calls)
			}
			if _, err := os.Stat(checkLog); (err == nil) != tc.wantCheck {
				t.Fatalf("connectivity check ran = %v, want %v", err == nil, tc.wantCheck)
			}
		})
	}
}

// fakeNmcli answers the two queries the status script makes and logs each
// connectivity check.
const fakeNmcli = `#!/bin/sh
case "$*" in
"-t -f TYPE,STATE device")
	[ -z "$FAKE_DEVICES_FAIL" ] || { echo 'Error: NetworkManager is not running.' >&2; exit 8; }
	printf '%s' "$FAKE_DEVICES" ;;
"networking connectivity check")
	echo check >> "$FAKE_LOG"
	[ -z "$FAKE_CHECK_FAIL" ] || { echo 'Error: timeout expired.' >&2; exit 1; }
	echo "$FAKE_CONNECTIVITY" ;;
*)
	exit 2 ;;
esac
`

func flag(b bool) string {
	if b {
		return "1"
	}
	return ""
}

// fakeConn runs the command locally, like the board would over SSH.
type fakeConn struct {
	remote.RemoteConn // only GetCmd is reached

	env   []string
	calls int
}

func (c *fakeConn) GetCmd(name string, args ...string) remote.Cmder {
	c.calls++
	return &fakeCmder{name: name, args: args, env: c.env}
}

type fakeCmder struct {
	remote.Cmder // only Output is reached

	name string
	args []string
	env  []string
}

func (c *fakeCmder) Output(ctx context.Context) ([]byte, error) {
	cmd := exec.CommandContext(ctx, c.name, c.args...)
	cmd.Env = c.env
	// SSHCommand.Output also merges stderr into the reply.
	return cmd.CombinedOutput()
}
