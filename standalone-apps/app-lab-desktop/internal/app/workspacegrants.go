package app

// The user's "Always allow" answers, kept per workspace so a grant follows the app across chats and never reaches another; see toolgrants.go for why the engine can't hold them.

import (
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"strings"

	"app-lab-desktop/internal/airuntime"
)

const workspaceGrantsFile = "workspace-grants.json"

// boardGrantKey namespaces a workspace by the board holding it. An app id is base64 of "type:name", so the same
// app name on two boards yields the same id: without this they share one bucket, and an "always allow" given on
// one board answers for the other. The agent still passes bare app ids; this file is where the board is added.
func boardGrantKey(boardID, workspaceID string) string { return boardID + "\x00" + workspaceID }

// splitBoardGrantKey reverses it; a key with no separator predates board scoping and belongs to no board.
func splitBoardGrantKey(key string) (boardID, workspaceID string, ok bool) {
	board, workspace, found := strings.Cut(key, "\x00")
	if !found {
		return "", "", false
	}
	return board, workspace, true
}

// workspaceGrants owns the file behind agent.GrantStore; the agent package knows nothing about where it lives.
type workspaceGrants struct{ app *App }

// LoadGrants reads every workspace's grants; a missing or unreadable file reads as none, like the other client stores.
func (w workspaceGrants) LoadGrants() map[string][]string {
	dir, err := w.app.agentConfigDir()
	if err != nil {
		return nil
	}
	boardID := w.app.selectedBoardID()
	w.app.storeMu.Lock()
	defer w.app.storeMu.Unlock()
	// Only this board's grants: an entry written before board scoping belongs to no board and is left alone
	// rather than adopted, since adopting it is exactly the cross-board approval this keying prevents.
	out := map[string][]string{}
	for key, keys := range readWorkspaceGrants(dir) {
		if board, workspace, ok := splitBoardGrantKey(key); ok && board == boardID {
			out[workspace] = keys
		}
	}
	return out
}

// SaveGrants replaces one workspace's grants, leaving every other workspace's untouched.
func (w workspaceGrants) SaveGrants(workspaceID string, keys []string) {
	dir, err := w.app.agentConfigDir()
	if err != nil {
		return
	}
	key := boardGrantKey(w.app.selectedBoardID(), workspaceID)
	w.app.storeMu.Lock()
	defer w.app.storeMu.Unlock()
	all := readWorkspaceGrants(dir)
	if all == nil {
		all = map[string][]string{}
	}
	if len(keys) == 0 {
		delete(all, key)
	} else {
		all[key] = keys
	}
	_ = writeWorkspaceGrants(dir, all)
}

// Revision lets the agent notice a rewrite it did not make, without re-reading the file on every permission.
func (w workspaceGrants) Revision() uint64 { return w.app.grantsRev.Load() }

func readWorkspaceGrants(dir string) map[string][]string {
	data, err := os.ReadFile(filepath.Join(dir, workspaceGrantsFile))
	if err != nil {
		return map[string][]string{}
	}
	grants := map[string][]string{}
	if err := json.Unmarshal(data, &grants); err != nil {
		return map[string][]string{} // an unreadable file costs the user a re-prompt, never a wrong auto-approval
	}
	return grants
}

// writeWorkspaceGrants persists the map atomically (temp file + rename) so an interrupted write can't corrupt it.
func writeWorkspaceGrants(dir string, grants map[string][]string) error {
	data, err := json.MarshalIndent(grants, "", "  ")
	if err != nil {
		return err
	}
	tmp := filepath.Join(dir, workspaceGrantsFile+".tmp")
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, filepath.Join(dir, workspaceGrantsFile))
}

// workspaceStoreDir locates these stores without a running agent: renaming and deleting are ordinary actions, and their bookkeeping must not wait for a chat to be open.
func (a *App) workspaceStoreDir() (string, error) {
	a.agentMu.Lock()
	id := a.agentMgrID
	a.agentMu.Unlock()
	if id == "" {
		id = airuntime.AgentClaude
	}
	return airuntime.AgentConfigDir(id)
}

// RebindWorkspaceApp moves everything keyed on an app id when a rename mints a new one: otherwise the workspace loses its grants and sessions, and a later app of the old name inherits them.
func (a *App) RebindWorkspaceApp(oldID, newID, newName string) {
	oldID, newID = strings.TrimSpace(oldID), strings.TrimSpace(newID)
	if oldID == "" || newID == "" || oldID == newID {
		return
	}
	dir, err := a.workspaceStoreDir()
	if err != nil {
		return
	}
	// Read before the rekey: the mirror dir carries the app's name, so both directories are needed to move the grants.
	oldMirror, newMirror := filepath.Base(a.workspaceMirrorDir(oldID)), filepath.Base(a.workspaceMirrorDir(newID))
	boardID := a.selectedBoardID() // the rename happened on this board: another board's app of the same id keeps its own name
	a.rebindCheckout(oldID, newID) // the move on disk first, so the stores below describe where the files actually are
	a.storeMu.Lock()
	rekeyWorkspaceApp(dir, oldID, newID, newName, boardID)
	remapGrantsToRenamedApp(dir, oldID, newID, oldMirror, newMirror, boardID)
	a.storeMu.Unlock()
	a.grantsRev.Add(1)
	// The stores are only half of it: a chat already open still resolves to the old id until the connection is told.
	if m, err := a.agentManager(); err == nil {
		m.RebindWorkspace(oldID, newID)
	}
}

// remapGrantsToRenamedApp rewrites what a rename invalidates inside the grants: the mirror dir in a file grant's title and the app id an app tool is scoped to.
func remapGrantsToRenamedApp(dir, oldID, newID, oldMirror, newMirror, boardID string) {
	grants := readWorkspaceGrants(dir)
	bucket := boardGrantKey(boardID, newID)
	keys := grants[bucket]
	if keys == nil {
		return
	}
	movePath := oldMirror != "" && newMirror != "" && oldMirror != newMirror && oldMirror != "." && newMirror != "."
	changed := false
	for i, k := range keys {
		moved := k
		if movePath {
			// A blunt substring rewrite, safe only because mirrorAppSegment suffixes a hash of the app id: no other part of a key can hold the mirror's base name.
			moved = strings.ReplaceAll(moved, oldMirror, newMirror)
		}
		if kind, title, scope, ok := splitGrantKey(moved); ok && scope == oldID {
			moved = kind + "\x00" + title + "\x00" + newID
		}
		if moved != k {
			keys[i], changed = moved, true
		}
	}
	if changed {
		grants[bucket] = keys
		_ = writeWorkspaceGrants(dir, grants)
	}
}

// splitGrantKey takes a grant apart into the three parts the agent packs into it: kind, title and scope.
func splitGrantKey(key string) (kind, title, scope string, ok bool) {
	parts := strings.Split(key, "\x00")
	if len(parts) != 3 {
		return "", "", "", false
	}
	return parts[0], parts[1], parts[2], true
}

// rekeyWorkspaceApp moves one app's grants and sessions onto a new id; the caller holds the store lock.
// Only the renaming board's are moved: app ids repeat across boards, so another board's same-named app keeps its own.
func rekeyWorkspaceApp(dir, oldID, newID, newName, boardID string) {
	from, to := boardGrantKey(boardID, oldID), boardGrantKey(boardID, newID)
	if grants := readWorkspaceGrants(dir); grants[from] != nil {
		grants[to] = grants[from]
		delete(grants, from)
		_ = writeWorkspaceGrants(dir, grants)
	}

	workspaces, err := readSessionWorkspaces(dir)
	if err != nil {
		return
	}
	changed := false
	for sessionID, ws := range workspaces {
		if ws.AppID != oldID || !ws.onBoard(boardID) {
			continue
		}
		// BoardID carried over: the rename doesn't move the session to another board, and losing it would unscope the row.
		workspaces[sessionID] = sessionWorkspaceEntry{AppID: newID, Name: strings.TrimSpace(newName), BoardID: ws.BoardID}
		changed = true
	}
	if changed {
		_ = writeSessionWorkspaces(dir, workspaces)
	}
}

// ForgetWorkspaceApp drops a deleted app's grants and chats: ids are derived from the name, so the next app of that name would inherit permissions nobody gave it.
// Only the local stores are rewritten before returning. Deleting the chats on the agent is several unbounded ACP round-trips each (with retries), so it
// runs in the background: the caller is either the delete dialog, which would sit on the spinner for an app the board has already removed, or the
// apps_delete tool handler, whose own agent is blocked awaiting its result and so cannot service those requests.
func (a *App) ForgetWorkspaceApp(appID string) {
	appID = strings.TrimSpace(appID)
	if appID == "" {
		return
	}
	dir, err := a.workspaceStoreDir()
	if err != nil {
		return
	}
	boardID := a.selectedBoardID() // the app was deleted from this board: another board's app of the same id keeps its chats
	a.storeMu.Lock()
	dropWorkspaceApp(dir, appID, boardID)
	chats := chatsOfWorkspaceApp(dir, appID, boardID)
	a.storeMu.Unlock()
	a.grantsRev.Add(1)
	// Told now, not once the chats are gone: a panel sitting on the deleted app has to move off straight away. This is
	// also the only notice the UI gets when the agent deleted the app itself, through apps_delete.
	a.emit("agent:workspace-app-forgotten", appID)
	go a.deleteWorkspaceAppChats(dir, appID, boardID, chats)
}

// chatsOfWorkspaceApp lists the sessions bound to one app on one board; the caller holds the store lock.
func chatsOfWorkspaceApp(dir, appID, boardID string) []string {
	if appID == "" {
		return nil // the general workspace is not an app and outlives every one of them
	}
	workspaces, err := readSessionWorkspaces(dir)
	if err != nil {
		return nil
	}
	var chats []string
	for sessionID, ws := range workspaces {
		if ws.AppID == appID && ws.onBoard(boardID) {
			chats = append(chats, sessionID)
		}
	}
	return chats
}

// deleteWorkspaceAppChats removes them one by one, skipping any with a turn in flight: the agent can delete an app from inside a chat about it.
// Runs on its own goroutine (see ForgetWorkspaceApp), so it takes the store lock itself and reports failures to the log rather than to a caller.
func (a *App) deleteWorkspaceAppChats(dir, appID, boardID string, chats []string) {
	if len(chats) == 0 {
		return
	}
	m, err := a.agentManager()
	if err != nil {
		slog.Info("[workspace] deleted app's chats left in place: the agent is not running", "app", appID, "chats", len(chats))
		return
	}
	streaming := m.StreamingSessions()
	kept := map[string]bool{}
	for _, sessionID := range chats {
		if streaming[sessionID] {
			kept[sessionID] = true
			continue
		}
		if err := a.AgentDeleteSession(sessionID); err != nil {
			// An unprompted chat was never persisted, so the engine refuses to delete it; the entry below is what would otherwise keep pointing at the app.
			slog.Info("[workspace] the engine did not delete a chat of the deleted app", "session", sessionID, "error", err)
		}
	}
	a.storeMu.Lock()
	defer a.storeMu.Unlock()
	dropWorkspaceAppSessions(dir, appID, boardID, kept)
}

// dropWorkspaceAppSessions forgets which app the leftovers belonged to, minus the ones still running and another board's; the caller holds the store lock.
func dropWorkspaceAppSessions(dir, appID, boardID string, kept map[string]bool) {
	workspaces, err := readSessionWorkspaces(dir)
	if err != nil {
		return
	}
	changed := false
	for sessionID, ws := range workspaces {
		if ws.AppID != appID || !ws.onBoard(boardID) || kept[sessionID] {
			continue
		}
		if ws.BoardID == "" {
			delete(workspaces, sessionID)
		} else {
			// The app is gone, the board isn't: keep the board alone so a leftover stays scoped to it instead of showing on every board.
			workspaces[sessionID] = sessionWorkspaceEntry{BoardID: ws.BoardID}
		}
		changed = true
	}
	if changed {
		_ = writeSessionWorkspaces(dir, workspaces)
	}
}

// dropWorkspaceApp forgets one app's grants on the board it was deleted from; the caller holds the store lock.
func dropWorkspaceApp(dir, appID, boardID string) {
	grants := readWorkspaceGrants(dir)
	key := boardGrantKey(boardID, appID)
	if grants[key] == nil {
		return
	}
	delete(grants, key)
	_ = writeWorkspaceGrants(dir, grants)
}
