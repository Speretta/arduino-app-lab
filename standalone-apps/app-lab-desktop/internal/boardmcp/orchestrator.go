package boardmcp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// noArgs is the input type for tools that take no parameters.
type noArgs struct{}

// maxOrchestratorBody caps a tool result at 1 MiB so it can't blow up the model context.
const maxOrchestratorBody = 1 << 20

// sseStallTimeout ends a progress stream that has gone quiet: a dropped connection leaves a half-open socket that reads forever, and the download's own cap is an hour away.
const sseStallTimeout = 3 * time.Minute

// sseClient bounds the wait for response headers; the body of a progress stream is long-lived on purpose, so there is no overall Timeout.
var sseClient = &http.Client{Transport: sseTransport()}

func sseTransport() http.RoundTripper {
	t := http.DefaultTransport.(*http.Transport).Clone()
	t.ResponseHeaderTimeout = 30 * time.Second
	return t
}

// orchestratorGet does a GET {orchestratorBaseURL}{path} and returns the response body, with a clear error when no board is connected.
func orchestratorGet(ctx context.Context, access BoardAccess, path string) (string, error) {
	base, err := access.OrchestratorBaseURL(ctx)
	if err != nil {
		return "", fmt.Errorf("no board connected: %w", err)
	}
	if base == "" {
		return "", fmt.Errorf("no board connected")
	}

	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+path, nil)
	if err != nil {
		return "", err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("orchestrator request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxOrchestratorBody))
	if err != nil {
		return "", err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("orchestrator returned %s: %s", resp.Status, string(body))
	}
	return string(body), nil
}

// orchestratorPost does a POST {orchestratorBaseURL}{path} with a JSON body and returns the response body, with a clear error when no board is connected.
func orchestratorPost(ctx context.Context, access BoardAccess, path string, body []byte) (string, error) {
	base, err := access.OrchestratorBaseURL(ctx)
	if err != nil {
		return "", fmt.Errorf("no board connected: %w", err)
	}
	if base == "" {
		return "", fmt.Errorf("no board connected")
	}

	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+path, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("orchestrator request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, maxOrchestratorBody))
	if err != nil {
		return "", err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("orchestrator returned %s: %s", resp.Status, string(respBody))
	}
	return string(respBody), nil
}

// orchestratorRequest does a {method} {orchestratorBaseURL}{path} with an optional JSON body (nil for none) and
// returns the response body. Used for the mutating verbs (PUT/PATCH/DELETE); GET/POST have their own helpers.
func orchestratorRequest(ctx context.Context, access BoardAccess, method, path string, body []byte) (string, error) {
	base, err := access.OrchestratorBaseURL(ctx)
	if err != nil {
		return "", fmt.Errorf("no board connected: %w", err)
	}
	if base == "" {
		return "", fmt.Errorf("no board connected")
	}

	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, base+path, reader)
	if err != nil {
		return "", err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("orchestrator request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, maxOrchestratorBody))
	if err != nil {
		return "", err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("orchestrator returned %s: %s", resp.Status, string(respBody))
	}
	return string(respBody), nil
}

// textResult wraps plain text as an MCP tool result.
func textResult(text string) *mcp.CallToolResult {
	return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: text}}}
}

// orchestratorStream PUTs and consumes an SSE progress stream to the end, reporting byte counts to onProgress; it never decides success, since the terminal event is unreliable — the caller re-reads the resource.
func orchestratorStream(ctx context.Context, access BoardAccess, path string, onProgress func(current, total int64)) (string, error) {
	base, err := access.OrchestratorBaseURL(ctx)
	if err != nil || base == "" {
		return "", fmt.Errorf("no board connected")
	}

	// Cancelled on the way out so a stalled read cannot leave the body goroutine parked on a half-open socket.
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, base+path, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "text/event-stream")
	resp, err := sseClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("orchestrator request failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, maxOrchestratorBody))
		return "", fmt.Errorf("orchestrator returned %s: %s", resp.Status, string(body))
	}
	return scanSSEForError(ctx, resp.Body, sseStallTimeout, onProgress)
}

// scanSSEForError reads an SSE stream to the end (framing left to readSSE), returning the last real error event and erroring out if the stream falls silent for stallAfter.
func scanSSEForError(ctx context.Context, body io.Reader, stallAfter time.Duration, onProgress func(current, total int64)) (string, error) {
	events := make(chan sseEvent)
	go readSSE(ctx, body, events)

	stall := time.NewTimer(stallAfter)
	defer stall.Stop()
	failure := ""
	for {
		var ev sseEvent
		select {
		case <-ctx.Done():
			return failure, ctx.Err()
		case <-stall.C:
			return failure, fmt.Errorf("the board stopped sending download progress for %s", stallAfter)
		case e, ok := <-events:
			if !ok {
				return failure, nil
			}
			ev = e
		}
		stall.Stop()
		stall.Reset(stallAfter)
		if ev.name == "progress" && onProgress != nil {
			var p struct {
				Current int64 `json:"current"`
				Total   int64 `json:"total"`
			}
			if json.Unmarshal([]byte(ev.data), &p) == nil {
				onProgress(p.Current, p.Total)
			}
			continue
		}
		if ev.name != "error" {
			continue
		}
		var payload struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		}
		// SERVER_CLOSED is how a normal end of stream arrives, not a failure.
		if json.Unmarshal([]byte(ev.data), &payload) == nil && payload.Code != "SERVER_CLOSED" {
			failure = payload.Message
			if failure == "" {
				failure = payload.Code
			}
		}
	}
}
