package app

import (
	"os"
	"path/filepath"
	"sort"
	"testing"
)

// An app id is base64 of "type:name": a rename mints a new one and a freed name can be retaken, silently losing grants or handing them to a different app.
func TestWorkspaceGrantsRekeying(t *testing.T) {
	const oldID, newID = "dXNlcjpibGluaw", "dXNlcjpibGluay0y"

	seed := func(t *testing.T) string {
		t.Helper()
		dir := t.TempDir()
		if err := writeWorkspaceGrants(dir, map[string][]string{
			boardGrantKey("board-a", oldID):  {"other\x00mcp__arduino-board__apps_start"},
			boardGrantKey("board-b", oldID):  {"other\x00mcp__arduino-board__apps_start"},
			boardGrantKey("board-a", "keep"): {"other\x00mcp__arduino-board__apps_stop"},
		}); err != nil {
			t.Fatal(err)
		}
		if err := writeSessionWorkspaces(dir, map[string]sessionWorkspaceEntry{
			"s1": {AppID: oldID, Name: "Blink", BoardID: "board-a"},
			"s2": {AppID: "other", Name: "Other"},
			// Same app id, another board: ids are derived from the name, so two boards can both hold a "Blink".
			"s3": {AppID: oldID, Name: "Blink", BoardID: "board-b"},
		}); err != nil {
			t.Fatal(err)
		}
		return dir
	}

	t.Run("a rename carries the grants and the sessions over", func(t *testing.T) {
		dir := seed(t)
		rekeyWorkspaceApp(dir, oldID, newID, "Blink 2", "board-a")

		grants := readWorkspaceGrants(dir)
		if len(grants[boardGrantKey("board-a", newID)]) != 1 || grants[boardGrantKey("board-a", oldID)] != nil {
			t.Errorf("grants did not follow the rename: %+v", grants)
		}
		if len(grants[boardGrantKey("board-a", "keep")]) != 1 {
			t.Error("another app's grants were touched")
		}
		// The other board holds an app of the same id: its grants are not the renaming board's to move.
		if len(grants[boardGrantKey("board-b", oldID)]) != 1 {
			t.Error("another board's grants were moved by this board's rename")
		}

		ws, err := readSessionWorkspaces(dir)
		if err != nil {
			t.Fatal(err)
		}
		if ws["s1"].AppID != newID || ws["s1"].Name != "Blink 2" {
			t.Errorf("the session still points at the old app: %+v", ws["s1"])
		}
		// A rename is not a move to another board: losing the board would list the session on every one of them.
		if ws["s1"].BoardID != "board-a" {
			t.Errorf("the rename dropped the session's board: %+v", ws["s1"])
		}
		if ws["s2"].AppID != "other" {
			t.Error("another app's session was rewritten")
		}
		// The rename happened on board A: board B's app of that id was not renamed and must keep its own name and id.
		if ws["s3"].AppID != oldID || ws["s3"].Name != "Blink" {
			t.Errorf("another board's app was renamed too: %+v", ws["s3"])
		}
	})

	t.Run("a delete drops the grants so a same-named app cannot inherit them", func(t *testing.T) {
		dir := seed(t)
		dropWorkspaceApp(dir, oldID, "board-a")

		grants := readWorkspaceGrants(dir)
		if grants[boardGrantKey("board-a", oldID)] != nil {
			t.Error("a deleted app kept its grants")
		}
		if len(grants[boardGrantKey("board-a", "keep")]) != 1 {
			t.Error("another app's grants were dropped too")
		}
		// Deleting on one board must not disarm the same-named app on the other.
		if len(grants[boardGrantKey("board-b", oldID)]) != 1 {
			t.Error("another board's grants were dropped too")
		}
	})

	t.Run("an unknown app changes nothing", func(t *testing.T) {
		dir := seed(t)
		before, err := os.ReadFile(filepath.Join(dir, workspaceGrantsFile))
		if err != nil {
			t.Fatal(err)
		}
		rekeyWorkspaceApp(dir, "nope", "also-nope", "", "board-a")
		dropWorkspaceApp(dir, "nope", "board-a")
		after, _ := os.ReadFile(filepath.Join(dir, workspaceGrantsFile))
		if string(before) != string(after) {
			t.Error("the file was rewritten for an app it does not hold")
		}
	})
}

// A rename moves the mirror directory every file grant's title carries: left behind, the grants sit under the new id matching nothing and the user is asked again.
func TestRenameFollowsTheGrantsOntoTheNewMirror(t *testing.T) {
	dir := t.TempDir()
	const old, new = "board__user-blink-blue-039ad4", "board__user-blink-azure-7c1e2b"
	write := func(grants map[string][]string) {
		if err := writeWorkspaceGrants(dir, grants); err != nil {
			t.Fatal(err)
		}
	}
	write(map[string][]string{
		boardGrantKey("board-a", "newid"): {
			"edit\x00Edit " + old + "/python/main.py\x00",
			"other\x00mcp__arduino-board__apps_start\x00oldid",
			"other\x00mcp__arduino-board__apps_start\x00someoneelse",
		},
	})

	remapGrantsToRenamedApp(dir, "oldid", "newid", old, new, "board-a")

	got := readWorkspaceGrants(dir)[boardGrantKey("board-a", "newid")]
	if got[0] != "edit\x00Edit "+new+"/python/main.py\x00" {
		t.Errorf("the file grant still points at the old mirror: %q", got[0])
	}
	// An app tool is scoped to the app id, so that half has to move as well or the permission stops matching.
	if got[1] != "other\x00mcp__arduino-board__apps_start\x00newid" {
		t.Errorf("the app tool's grant still names the old app: %q", got[1])
	}
	if got[2] != "other\x00mcp__arduino-board__apps_start\x00someoneelse" {
		t.Errorf("another app's grant was rewritten: %q", got[2])
	}
}

// A chat outlives the app it was about only to fail at its first checkout, so deleting the app takes its chats with it.
func TestDeletingAnAppFindsItsChats(t *testing.T) {
	dir := t.TempDir()
	if err := writeSessionWorkspaces(dir, map[string]sessionWorkspaceEntry{
		"s-doomed":  {AppID: "gone", Name: "Gone", BoardID: "board-a"},
		"s-doomed2": {AppID: "gone", Name: "Gone"}, // written before board scoping: kept, like the sidebar keeps it
		"s-other":   {AppID: "stays", Name: "Stays"},
		"s-general": {},
		// Another board's app of the same id: its chats are about an app that still exists.
		"s-elsewhere": {AppID: "gone", Name: "Gone", BoardID: "board-b"},
	}); err != nil {
		t.Fatal(err)
	}

	got := chatsOfWorkspaceApp(dir, "gone", "board-a")

	sort.Strings(got)
	if len(got) != 2 || got[0] != "s-doomed" || got[1] != "s-doomed2" {
		t.Errorf("the deleted app's chats came out as %v", got)
	}
	if len(chatsOfWorkspaceApp(dir, "", "board-a")) != 0 {
		t.Error("an empty app id swept up the general chats")
	}
}

// The engine refuses to delete a chat it never persisted, and a running one is left alone on purpose — but nothing may go on claiming an app that no longer exists.
func TestDeletingAnAppLeavesNoChatClaimingIt(t *testing.T) {
	dir := t.TempDir()
	if err := writeSessionWorkspaces(dir, map[string]sessionWorkspaceEntry{
		"s-draft":     {AppID: "gone", Name: "Gone"},
		"s-running":   {AppID: "gone", Name: "Gone"},
		"s-other":     {AppID: "stays", Name: "Stays"},
		"s-boarded":   {AppID: "gone", Name: "Gone", BoardID: "board-a"},
		"s-elsewhere": {AppID: "gone", Name: "Gone", BoardID: "board-b"},
	}); err != nil {
		t.Fatal(err)
	}

	dropWorkspaceAppSessions(dir, "gone", "board-a", map[string]bool{"s-running": true})

	left, err := readSessionWorkspaces(dir)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := left["s-draft"]; ok {
		t.Error("an unprompted chat still claims the deleted app")
	}
	if _, ok := left["s-running"]; !ok {
		t.Error("the chat still running lost its app")
	}
	if _, ok := left["s-other"]; !ok {
		t.Error("another app's chat was swept up")
	}
	// The app is gone, the board isn't: dropping the entry outright would list the leftover on every board.
	if ws := left["s-boarded"]; ws.AppID != "" || ws.BoardID != "board-a" {
		t.Errorf("a leftover lost its board instead of just its app: %+v", ws)
	}
	// The delete happened on board A; board B's app of that id is still there, so its chats keep pointing at it.
	if ws := left["s-elsewhere"]; ws.AppID != "gone" || ws.BoardID != "board-b" {
		t.Errorf("another board's chat lost the app it is about: %+v", ws)
	}
}

// These writers run with whatever board is connected, so "no board" must never widen to "every board".
func TestNoConnectedBoardTouchesOnlyUnscopedSessions(t *testing.T) {
	dir := t.TempDir()
	seed := map[string]sessionWorkspaceEntry{
		"s-legacy":  {AppID: "gone", Name: "Gone"},
		"s-board-a": {AppID: "gone", Name: "Gone", BoardID: "board-a"},
	}
	if err := writeSessionWorkspaces(dir, seed); err != nil {
		t.Fatal(err)
	}

	if got := chatsOfWorkspaceApp(dir, "gone", ""); len(got) != 1 || got[0] != "s-legacy" {
		t.Errorf("chats came out as %v, want only the unscoped one", got)
	}
	dropWorkspaceAppSessions(dir, "gone", "", nil)
	rekeyWorkspaceApp(dir, "gone", "renamed", "Renamed", "")

	left, err := readSessionWorkspaces(dir)
	if err != nil {
		t.Fatal(err)
	}
	if ws := left["s-board-a"]; ws.AppID != "gone" || ws.BoardID != "board-a" {
		t.Errorf("a board's session was rewritten with no board connected: %+v", ws)
	}
}

// An "always allow" is answered for one board's app, not for whatever app of that name another board happens to
// hold: ids come from the name, so without the board in the key an app tool granted on A auto-approves on B.
func TestGrantsDoNotCrossBoards(t *testing.T) {
	dir := t.TempDir()
	const blink = "dXNlcjpibGluaw"
	const start = "other\x00mcp__arduino-board__apps_start\x00" + blink
	if err := writeWorkspaceGrants(dir, map[string][]string{
		boardGrantKey("board-a", blink): {start},
		blink:                           {start}, // written before board scoping: belongs to no board
	}); err != nil {
		t.Fatal(err)
	}

	all := readWorkspaceGrants(dir)
	if _, ok := all[boardGrantKey("board-b", blink)]; ok {
		t.Fatal("the seed already holds board B")
	}

	// What LoadGrants hands the agent for each board, mirrored here so the test does not need an App.
	forBoard := func(boardID string) map[string][]string {
		out := map[string][]string{}
		for key, keys := range all {
			if board, workspace, ok := splitBoardGrantKey(key); ok && board == boardID {
				out[workspace] = keys
			}
		}
		return out
	}

	if len(forBoard("board-a")[blink]) != 1 {
		t.Error("the granting board lost its own grant")
	}
	if got := forBoard("board-b")[blink]; got != nil {
		t.Errorf("board B inherited board A's always-allow: %q", got)
	}
	// A pre-scoping entry names no board, and adopting it for the connected one is the same cross-board approval.
	if got := forBoard("")[blink]; got != nil {
		t.Errorf("an unscoped legacy entry was adopted: %q", got)
	}
}
