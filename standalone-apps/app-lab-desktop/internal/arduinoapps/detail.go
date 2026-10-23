package arduinoapps

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"app-lab-desktop/internal/board"
)

// maxAppDetailBody caps the app-detail response so a hostile/huge body can't be read unbounded (mirrors boardmcp's 1 MiB cap).
const maxAppDetailBody = 1 << 20

// AppTarget is where an app's files live on the board, plus whether it is a built-in or a release the agent must not modify.
type AppTarget struct {
	Path     string
	ReadOnly bool
}

// builtInIDPrefix opens the decoded id of every built-in app (inspirational, core-and-foundational and brick examples).
const builtInIDPrefix = "examples:"

// ResolveApp returns an app's board path and read-only verdict from the orchestrator's app detail (GET /v1/apps/{id}).
func ResolveApp(ctx context.Context, orchestratorURL, appID string) (AppTarget, error) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	endpoint := fmt.Sprintf("%s/v1/apps/%s", orchestratorURL, url.PathEscape(appID))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return AppTarget{}, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return AppTarget{}, fmt.Errorf("app detail request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxAppDetailBody))
	if err != nil {
		return AppTarget{}, err
	}
	if resp.StatusCode != http.StatusOK {
		return AppTarget{}, fmt.Errorf("app detail returned %d: %s", resp.StatusCode, string(body))
	}
	var detail struct {
		Path string `json:"path"`
		// A pointer so an orchestrator that omits the field is distinguishable from one saying false.
		Example *bool `json:"example"`
		Release bool  `json:"release"`
	}
	if err := json.Unmarshal(body, &detail); err != nil {
		return AppTarget{}, fmt.Errorf("parse app detail: %w", err)
	}
	if detail.Path == "" {
		return AppTarget{}, fmt.Errorf("app %q has no path on the board", appID)
	}
	appsDir, err := board.UserAppsDir(ctx, orchestratorURL)
	if err != nil {
		return AppTarget{}, err
	}
	ro := readOnly(appID, detail.Example) || detail.Release || !board.IsUserAppPath(detail.Path, appsDir)
	return AppTarget{Path: detail.Path, ReadOnly: ro}, nil
}

// readOnly falls back to the app id when the flag is absent, counting an unreadable id as built-in: a wrong "writable" overwrites files the user cannot restore.
func readOnly(appID string, example *bool) bool {
	if example != nil && *example {
		return true
	}
	decoded, err := decodeAppID(appID)
	if err != nil {
		return example == nil
	}
	return strings.HasPrefix(decoded, builtInIDPrefix)
}

// decodeAppID decodes an app id, which the orchestrator emits as unpadded base64 in either alphabet.
func decodeAppID(appID string) (string, error) {
	trimmed := strings.TrimRight(appID, "=")
	if b, err := base64.RawURLEncoding.DecodeString(trimmed); err == nil {
		return string(b), nil
	}
	b, err := base64.RawStdEncoding.DecodeString(trimmed)
	return string(b), err
}

// AppName returns an app's display name from the orchestrator's app detail (GET /v1/apps/{id}). Best-effort,
// used to label the permission dialog with a readable name; a short timeout keeps a slow board from delaying it.
func AppName(ctx context.Context, orchestratorURL, appID string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	endpoint := fmt.Sprintf("%s/v1/apps/%s", orchestratorURL, url.PathEscape(appID))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return "", err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("app detail request failed: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxAppDetailBody))
	if err != nil {
		return "", err
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("app detail returned %d: %s", resp.StatusCode, string(body))
	}
	var detail struct {
		Name string `json:"name"`
	}
	if err := json.Unmarshal(body, &detail); err != nil {
		return "", fmt.Errorf("parse app detail: %w", err)
	}
	return detail.Name, nil
}

// List returns the ids of every app on the board (user apps and examples), from GET /v1/apps.
func List(ctx context.Context, orchestratorURL string) ([]string, error) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	endpoint := fmt.Sprintf("%s/v1/apps", orchestratorURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("apps list request failed: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxAppDetailBody))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("apps list returned %d: %s", resp.StatusCode, string(body))
	}
	var parsed struct {
		Apps []struct {
			ID string `json:"id"`
		} `json:"apps"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("parse apps list: %w", err)
	}
	ids := make([]string, 0, len(parsed.Apps))
	for _, a := range parsed.Apps {
		if a.ID != "" {
			ids = append(ids, a.ID)
		}
	}
	return ids, nil
}
