package app

import (
	"os"
	"path/filepath"
	"testing"
)

// The file shipped once as sessionId → app id; reading that shape as empty would silently un-scope every session the user had already opened.
func TestReadSessionWorkspacesAcceptsBothShapes(t *testing.T) {
	dir := t.TempDir()
	write := func(body string) {
		if err := os.WriteFile(filepath.Join(dir, sessionWorkspacesFile), []byte(body), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	write(`{"s1":"dXNlcjpibGluaw"}`)
	got, err := readSessionWorkspaces(dir)
	if err != nil {
		t.Fatalf("legacy shape: %v", err)
	}
	if got["s1"].AppID != "dXNlcjpibGluaw" {
		t.Errorf("legacy pick dropped: %+v", got["s1"])
	}

	write(`{"s1":{"appId":"dXNlcjpibGluaw","name":"Blink"}}`)
	if got, err = readSessionWorkspaces(dir); err != nil {
		t.Fatalf("current shape: %v", err)
	}
	if got["s1"].Name != "Blink" {
		t.Errorf("remembered name lost: %+v", got["s1"])
	}

	write(`not json`)
	if got, err = readSessionWorkspaces(dir); err != nil || len(got) != 0 {
		t.Errorf("a corrupt file should read as empty, got %+v (%v)", got, err)
	}
}

// The name the caller has on screen must be taken as-is; a bare App has no board, so reaching the fallback at all panics here, which is what makes this a test.
func TestSessionWorkspaceUsesTheGivenName(t *testing.T) {
	a := &App{}

	ws := a.sessionWorkspace("dXNlcjpibGluaw", "Blink")
	if ws.AppID != "dXNlcjpibGluaw" || ws.Name != "Blink" {
		t.Errorf("name not carried through: %+v", ws)
	}

	if ws := a.sessionWorkspace("  ", "Blink"); ws.AppID != "" {
		t.Errorf("no app means the general workspace: %+v", ws)
	}
}
