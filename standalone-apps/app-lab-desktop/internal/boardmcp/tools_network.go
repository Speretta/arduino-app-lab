package boardmcp

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// registerWifiStatus adds wifi_status (read-only) and returns its name for the auto-approve allowlist.
func registerWifiStatus(srv *mcp.Server, access BoardAccess) string {
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "wifi_status",
		Description: "Report the connected board's network status: Wi-Fi state (connected/connecting/disconnected), the active connection name, and whether the board can reach the internet (bricks and AI models need it online). Read-only.",
		Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true},
	}, func(ctx context.Context, _ *mcp.CallToolRequest, _ noArgs) (*mcp.CallToolResult, any, error) {
		status, err := access.NetworkStatus(ctx)
		if err != nil {
			return nil, nil, err
		}
		j, err := json.MarshalIndent(status, "", "  ")
		if err != nil {
			return nil, nil, err
		}
		return textResult(string(j)), nil, nil
	})
	return "wifi_status"
}

// registerWifiList adds wifi_list (read-only) and returns its name for the auto-approve allowlist.
func registerWifiList(srv *mcp.Server, access BoardAccess) string {
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "wifi_list",
		Description: "List the Wi-Fi networks the connected board can currently see, by SSID. The scan runs on the board and takes a few seconds; like App Lab's own Wi-Fi dialog it turns the board's Wi-Fi radio on if it was off, which is its only effect. It does not report which networks are protected: call wifi_connect and the user is asked for a password if one is needed.",
		Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true},
	}, func(ctx context.Context, _ *mcp.CallToolRequest, _ noArgs) (*mcp.CallToolResult, any, error) {
		ssids, err := access.ListWiFiNetworks(ctx)
		if err != nil {
			return nil, nil, err
		}
		if len(ssids) == 0 {
			return textResult("No Wi-Fi networks in range."), nil, nil
		}
		j, err := json.MarshalIndent(ssids, "", "  ")
		if err != nil {
			return nil, nil, err
		}
		return textResult(string(j)), nil, nil
	})
	return "wifi_list"
}

type wifiConnectInput struct {
	SSID string `json:"ssid" jsonschema:"the network name to join, as reported by wifi_list"`
}

// registerWifiConnect adds wifi_connect (mutating): it opens App Lab's Wi-Fi dialog on the SSID instead of joining itself, because the passphrase belongs to the user alone (see RequestWiFiConnect).
func registerWifiConnect(srv *mcp.Server, access BoardAccess) {
	mcp.AddTool(srv, &mcp.Tool{
		Name: "wifi_connect",
		Description: "Ask the user to connect the board to a Wi-Fi network. Pass an SSID from wifi_list. This opens App Lab's Wi-Fi dialog on that network so the user can enter the password themselves — you never receive it, and you must never ask the user to type a Wi-Fi password into the chat. " +
			"The tool returns as soon as the dialog is open: the user still has to confirm, so poll wifi_status to see whether the board actually joined, and do not call wifi_connect again while you wait.",
		Annotations: &mcp.ToolAnnotations{ReadOnlyHint: false},
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in wifiConnectInput) (*mcp.CallToolResult, any, error) {
		ssid := strings.TrimSpace(in.SSID)
		if ssid == "" {
			return nil, nil, fmt.Errorf("ssid is required")
		}
		// A board we cannot read is not a board we may configure, so the error case fails the same way.
		if board, err := access.SelectedBoard(ctx); err != nil || !board.Connected {
			return nil, nil, fmt.Errorf("no board connected")
		}
		access.RequestWiFiConnect(ssid)
		return textResult(fmt.Sprintf("Opened the Wi-Fi dialog for %q. The user enters the password and confirms there; poll wifi_status to see whether the board joined. If it stays disconnected, the user may have cancelled — ask them before trying again.", ssid)), nil, nil
	})
}

// registerWifiDisconnect adds wifi_disconnect (mutating).
func registerWifiDisconnect(srv *mcp.Server, access BoardAccess) {
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "wifi_disconnect",
		Description: "Disconnect the connected board from Wi-Fi. Mutating: requires user approval. It is refused when App Lab is reaching the board over the network, because dropping Wi-Fi would also cut the connection you are working through.",
		Annotations: &mcp.ToolAnnotations{ReadOnlyHint: false},
	}, func(ctx context.Context, _ *mcp.CallToolRequest, _ noArgs) (*mcp.CallToolResult, any, error) {
		if err := access.DisconnectWiFi(ctx); err != nil {
			return nil, nil, err
		}
		return textResult("Disconnected from Wi-Fi. The board keeps any wired connection; wifi_status reports the new state."), nil, nil
	})
}
