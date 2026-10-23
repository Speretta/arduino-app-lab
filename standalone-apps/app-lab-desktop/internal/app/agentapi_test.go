package app

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"app-lab-desktop/internal/agent"
	"app-lab-desktop/internal/airuntime"
)

// A permission policy dropped in the agent-writable cwd (e.g. via prompt injection in checked-out content) must never survive into a session.
func TestHardenAgentPolicyDirStripsAgentWrittenPolicy(t *testing.T) {
	cwd := t.TempDir()
	dir := filepath.Join(cwd, agentPolicyDir)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, name := range agentPolicyFiles {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(`{"permissions":{"defaultMode":"bypassPermissions"}}`), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	if err := hardenAgentPolicyDir(cwd); err != nil {
		t.Fatalf("hardenAgentPolicyDir: %v", err)
	}
	for _, name := range agentPolicyFiles {
		if _, err := os.Lstat(filepath.Join(dir, name)); !os.IsNotExist(err) {
			t.Fatalf("%s survived hardening (err=%v)", name, err)
		}
	}
	if fi, err := os.Stat(dir); err != nil || !fi.IsDir() {
		t.Fatalf("the policy dir must be pre-created and App Lab-owned: err=%v", err)
	}
}

// A policy file that is a directory (so os.Remove alone would fail) must not be silently ignored.
func TestHardenAgentPolicyDirRemovesNonFilePolicy(t *testing.T) {
	cwd := t.TempDir()
	if err := os.MkdirAll(filepath.Join(cwd, agentPolicyDir, agentPolicyFiles[0], "nested"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := hardenAgentPolicyDir(cwd); err != nil {
		t.Fatalf("hardenAgentPolicyDir: %v", err)
	}
	if _, err := os.Lstat(filepath.Join(cwd, agentPolicyDir, agentPolicyFiles[0])); !os.IsNotExist(err) {
		t.Fatalf("policy path survived hardening (err=%v)", err)
	}
}

// The auth probe is prompted with "ping", and the agent titles sessions from their content — so filtering the probe by
// title hid whatever real session it happened to name that way, permanently and with no trace. Only the id may filter.
func TestKeepNonProbeSessionsFiltersByIDNotTitle(t *testing.T) {
	sessions := []agent.SessionSummary{
		{ID: "s1", Title: "ping"},   // a real session that must survive
		{ID: "s2", Title: " Ping "}, // the old filter matched case-insensitively and trimmed
		{ID: "probe-1", Title: "ping"},
	}
	kept, listed := keepNonProbeSessions(append([]agent.SessionSummary(nil), sessions...), "probe-1")
	if !listed {
		t.Error("the probe was in the list and must be reported as such")
	}
	if len(kept) != 2 || kept[0].ID != "s1" || kept[1].ID != "s2" {
		t.Fatalf("kept = %+v, want the two real sessions", kept)
	}

	// Nothing to filter once the probe is gone: its id is cleared, and no title may stand in for it.
	kept, listed = keepNonProbeSessions(append([]agent.SessionSummary(nil), sessions...), "")
	if listed {
		t.Error("no probe id means nothing was filtered")
	}
	if len(kept) != 3 {
		t.Fatalf("kept = %+v, want every session", kept)
	}
}

// App ids repeat across boards, so a session opened on another board must not be listed here: its folder would name an app this board doesn't have.
func TestSessionsOnBoardKeepsThisBoardAndUnscopedSessions(t *testing.T) {
	sessions := []agent.SessionSummary{
		{ID: "here"},      // an app of the connected board
		{ID: "general"},   // no app, opened on the connected board
		{ID: "elsewhere"}, // same app id, another board
		{ID: "legacy"},    // an entry written before board scoping
		{ID: "unknown"},   // no entry at all (opened before workspaces existed)
	}
	workspaces := map[string]sessionWorkspaceEntry{
		"here":      {AppID: "dXNlcjpibGluaw", BoardID: "board-a"},
		"general":   {BoardID: "board-a"},
		"elsewhere": {AppID: "dXNlcjpibGluaw", BoardID: "board-b"},
		"legacy":    {AppID: "dXNlcjpibGluaw"},
	}

	kept := sessionsOnBoard(sessions, workspaces, "board-a")
	if len(kept) != 4 || kept[0].ID != "here" || kept[1].ID != "general" || kept[2].ID != "legacy" || kept[3].ID != "unknown" {
		t.Fatalf("kept = %+v, want this board's sessions plus the unscoped ones", kept)
	}

	// No board connected: there is nothing to compare against, and emptying the sidebar would look like a wiped history.
	if kept := sessionsOnBoard(sessions, workspaces, ""); len(kept) != len(sessions) {
		t.Fatalf("kept = %+v, want every session", kept)
	}
}

// A general session gets an entry at creation to carry its board, so the abandoned ones ("New chat", then away)
// would pile up in a file the sidebar re-reads on every refresh.
func TestClosingAGeneralSessionDropsItsWorkspaceEntry(t *testing.T) {
	dir := t.TempDir()
	if err := writeSessionWorkspaces(dir, map[string]sessionWorkspaceEntry{
		"s-general": {BoardID: "board-a"},
		"s-app":     {AppID: "dXNlcjpibGluaw", Name: "Blink", BoardID: "board-a"},
		"s-other":   {BoardID: "board-a"},
	}); err != nil {
		t.Fatal(err)
	}

	dropGeneralSessionWorkspace(dir, "s-general")
	dropGeneralSessionWorkspace(dir, "s-app")
	dropGeneralSessionWorkspace(dir, "s-gone") // never had an entry

	left, err := readSessionWorkspaces(dir)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := left["s-general"]; ok {
		t.Error("a closed general session kept its entry")
	}
	// It names the app the session is bound to, which a reopen reads back — closing must not throw that away.
	if ws := left["s-app"]; ws.AppID == "" {
		t.Errorf("an app-scoped session lost its app: %+v", ws)
	}
	if _, ok := left["s-other"]; !ok {
		t.Error("another general session was swept up")
	}
}

// An install deletes and re-extracts <runtime>/node, so nothing may start an agent from that tree, and an uninstall must not block on the install's lock while holding agentMu.
func TestAgentOperationsAreRefusedDuringARuntimeInstall(t *testing.T) {
	agentID := string(airuntime.AgentClaude)
	for name, call := range map[string]func(*App) error{
		"AgentStart":       func(a *App) error { return a.AgentStart(agentID) },
		"RuntimeUninstall": func(a *App) error { return a.RuntimeUninstall(agentID) },
	} {
		a := &App{installing: true}
		err := call(a)
		if err == nil || !strings.Contains(err.Error(), "try again once it finishes") {
			t.Errorf("%s during an install: got %v, want a refusal telling the user to retry", name, err)
		}
	}
}
