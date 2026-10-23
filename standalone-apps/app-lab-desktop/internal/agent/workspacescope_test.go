package agent

import (
	"path/filepath"
	"strings"
	"testing"
)

// One "Always allow" on Edit used to cover every app's mirror, reaching the board with nothing shown; this predicate is what stops that and badges the prompt.
func TestWritesOutsideWorkspace(t *testing.T) {
	root := t.TempDir()
	ws := filepath.Join(root, "board__user-blink-3fa2c1")
	other := filepath.Join(root, "board__user-other-9de4f0")

	edit := func(path string) *ToolCall {
		return &ToolCall{Kind: "edit", Title: "Edit", Paths: []string{path}}
	}

	cases := []struct {
		name string
		tc   *ToolCall
		dir  string
		want bool
	}{
		{"a write inside the workspace app", edit(filepath.Join(ws, "python/main.py")), ws, false},
		{"a write into another app", edit(filepath.Join(other, "python/main.py")), ws, true},
		{"a write in the mirror root itself", edit(filepath.Join(root, "stray.py")), ws, true},
		{"a traversal out of the workspace", edit(filepath.Join(ws, "..", "other", "x.py")), ws, true},
		// The general workspace scopes nothing, and reading elsewhere is allowed on purpose: the workspace steers, it does not jail.
		{"a read outside", &ToolCall{Kind: "read", Paths: []string{filepath.Join(other, "main.py")}}, ws, false},
		// Deletes and moves change the board just as much as an edit.
		{"a delete outside", &ToolCall{Kind: "delete", Paths: []string{filepath.Join(other, "main.py")}}, ws, true},
		// A call whose target we cannot see must not be treated as outside, or everything would prompt forever.
		{"no path at all", &ToolCall{Kind: "edit", Title: "Edit"}, ws, false},
		{"nil tool call", nil, ws, false},
		// Kind is optional on a permission request (toToolCallRef leaves it empty). Reading that as "inside" would
		// give this the same grant key as an edit at home, and the next one would be auto-approved unprompted.
		{"no kind, path in another app", &ToolCall{Title: "Edit", Paths: []string{filepath.Join(other, "main.py")}}, ws, true},
		{"no kind, path at home", &ToolCall{Title: "Edit", Paths: []string{filepath.Join(ws, "main.py")}}, ws, false},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := actsOutsideWorkspace(c.tc, "user:blink", c.dir, root); got != c.want {
				t.Errorf("got %v, want %v", got, c.want)
			}
		})
	}
}

// Locations are what the agent declares; without them the native file tools still carry the path in their arguments.
func TestToolCallPathsFallsBackToArguments(t *testing.T) {
	tc := &ToolCall{Kind: "edit", Input: map[string]any{"file_path": "/m/app/main.py", "old_string": "a"}}
	if got := toolCallPaths(tc); len(got) != 1 || got[0] != "/m/app/main.py" {
		t.Errorf("path not read from the arguments: %v", got)
	}
	if got := toolCallPaths(&ToolCall{Kind: "edit", Input: "not a map"}); got != nil {
		t.Errorf("a non-map input should yield no paths, got %v", got)
	}
}

// Board tools name their target app, so "outside" is exact for them: apps_start on another app must still prompt.
func TestActsOutsideWorkspaceForBoardTools(t *testing.T) {
	const mine, theirs = "dXNlcjpibGluaw", "dXNlcjpvdGhlcg"
	callFn := func(input map[string]any) *ToolCall {
		return &ToolCall{Kind: "other", Title: "mcp__arduino-board__apps_start", Input: input}
	}

	if actsOutsideWorkspace(callFn(map[string]any{"id": mine}), mine, "", "") {
		t.Error("acting on the workspace app was flagged as outside")
	}
	if !actsOutsideWorkspace(callFn(map[string]any{"id": theirs}), mine, "", "") {
		t.Error("acting on another app was not flagged")
	}
	if !actsOutsideWorkspace(callFn(map[string]any{"appId": theirs}), mine, "", "") {
		t.Error("the appId spelling was not read")
	}
	// apps_create names no app: it is allowed to land outside, and its own tool description says so.
	if actsOutsideWorkspace(callFn(map[string]any{"name": "new one"}), mine, "", "") {
		t.Error("a tool that names no app was flagged")
	}
	// Without a workspace there is nothing to be outside of.
	if actsOutsideWorkspace(callFn(map[string]any{"id": theirs}), "", "", "") {
		t.Error("the general workspace constrained a call")
	}
}

// models_delete takes a MODEL id, bricks_get a BRICK id: reading any "id" as an app's would badge them wrongly and break their "Always allow".
func TestOnlyAppToolsAreMatchedByAppID(t *testing.T) {
	const mine = "dXNlcjpibGluaw"
	callFn := func(title string, input map[string]any) *ToolCall {
		return &ToolCall{Kind: "other", Title: "mcp__arduino-board__" + title, Input: input}
	}

	notAnApp := []struct{ tool, id string }{
		{"models_delete", "yolox-object-detection"},
		{"bricks_get", "arduino:video_object_detection"},
	}
	for _, c := range notAnApp {
		if actsOutsideWorkspace(callFn(c.tool, map[string]any{"id": c.id}), mine, "", "") {
			t.Errorf("%s: a %q id was read as an app id", c.tool, c.id)
		}
	}

	appTools := []string{"apps_start", "apps_delete", "app_bricks_add", "sketch_libraries_add"}
	for _, tool := range appTools {
		key := "id"
		if strings.HasPrefix(tool, "app_bricks_") {
			key = "appId"
		}
		if !actsOutsideWorkspace(callFn(tool, map[string]any{key: "dXNlcjpvdGhlcg"}), mine, "", "") {
			t.Errorf("%s on another app was not flagged", tool)
		}
		if actsOutsideWorkspace(callFn(tool, map[string]any{key: mine}), mine, "", "") {
			t.Errorf("%s on the workspace app was flagged", tool)
		}
	}

	// apps_create names no app on purpose: a new app is allowed to land outside.
	if actsOutsideWorkspace(callFn("apps_create", map[string]any{"name": "new"}), mine, "", "") {
		t.Error("apps_create was flagged")
	}
}

// The agent's paths are relative to the session's cwd, not App Lab's: the wrong base made every relative edit look like it left the workspace.
func TestRelativePathsAreAnchoredToTheSessionCwd(t *testing.T) {
	root := "/tmp/ai-mirror"
	ws := filepath.Join(root, "board__user-blink-3fa2c1")
	rel := func(p string) *ToolCall { return &ToolCall{Kind: "edit", Paths: []string{p}} }

	if actsOutsideWorkspace(rel("board__user-blink-3fa2c1/python/main.py"), "user:blink", ws, root) {
		t.Error("a relative path inside the workspace was read as outside")
	}
	if !actsOutsideWorkspace(rel("board__user-other-9de4f0/python/main.py"), "user:blink", ws, root) {
		t.Error("a relative path in another app was not flagged")
	}
}
