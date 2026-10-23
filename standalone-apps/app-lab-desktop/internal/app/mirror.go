package app

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"mime"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"app-lab-desktop/internal/airuntime"
	"app-lab-desktop/internal/appmirror"
	"app-lab-desktop/internal/arduinoapps"
	"app-lab-desktop/internal/fs"
)

// boardFiles adapts App's board file access to appmirror.BoardFS (over the selected board's connection).
type boardFiles struct{ app *App }

// ListFiles returns the absolute board path of every file under root, skipping
// images: GetFileContent base64-encodes those into data URIs, which don't round
// trip, so the mirror stays text-only.
//
// A walk that could not read some subtrees hands back both the paths it did find
// and the error naming those subtrees, leaving each caller to decide: Populate
// mirrors what it got, the callers that compare against a full board listing
// still fail.
func (b boardFiles) ListFiles(root string) ([]string, error) {
	relPaths, err := fs.ListFilePaths(root, b.app.boardConn())
	var unreadable *fs.UnreadableDirsError
	if err != nil && !errors.As(err, &unreadable) {
		return nil, err
	}
	var files []string
	for _, rel := range relPaths {
		if strings.HasPrefix(mime.TypeByExtension(path.Ext(rel)), "image/") {
			continue
		}
		files = append(files, path.Join(root, rel))
	}
	return files, err
}

func (b boardFiles) ReadFile(path string) (string, error) {
	content, err := b.app.GetFileContent(path)
	if err != nil {
		return "", err
	}
	return decodeImageDataURI(path, content)
}
func (b boardFiles) WriteFile(path, content string) error {
	// suppressWatch=false: these are the agent's edits synced back to the board, so we WANT the editor to refresh.
	return b.app.WriteFileContent(path, content, false)
}
func (b boardFiles) MkDirAll(path string) error   { return b.app.CreateFolder(path, false) }
func (b boardFiles) RemoveFile(path string) error { return b.app.RemoveFile(path, false) }

// decodeImageDataURI undoes GetFileContent's data-URI encoding of images (an editor feature): sync hashes need the raw bytes.
func decodeImageDataURI(p, content string) (string, error) {
	mt := mime.TypeByExtension(path.Ext(p))
	if !strings.Contains(mt, "image") {
		return content, nil
	}
	prefix := "data:" + mt + ";base64,"
	if !strings.HasPrefix(content, prefix) {
		return content, nil
	}
	raw, err := base64.StdEncoding.DecodeString(content[len(prefix):])
	if err != nil {
		return "", fmt.Errorf("decode image data URI %s: %w", p, err)
	}
	return string(raw), nil
}

// checkedApp is a board app the agent has checked out into a local mirror (edits sync back at turn-end).
type checkedApp struct {
	appPath  string    // board path of the app
	mirror   string    // local mirror dir
	baseline time.Time // set right after Populate; only edits after this are the agent's (not the initial copy)
	// hashes maps relative path → content hash of what was checked out: the set of paths known to exist on the board (for deletion detection) and what tells a real edit apart from an untouched file.
	hashes    map[string]string
	readOnly  bool // built-in app: mirrored so the agent can read it, never pushed back to the board
	baselined bool // hashes cover every board file (from Populate/Reconcile), so they can replace the mtime gate; false for a reattached mirror
	dirty     bool // last sync failed; the next sync re-pushes every edited file so none is stranded
}

// checkoutApp mirrors an app's files locally and returns the mirror path, the rel paths Reconcile parked
// (.claude-local) while resolving conflicts, and whether the app is read-only. A re-checkout keeps the existing
// mirror so pending edits aren't clobbered, but reconciles it with the board first: without that the agent would
// keep reasoning about (and force-pushing) checkout-time content, reverting whatever the user saved in the editor.
func (a *App) checkoutApp(appID string) (string, []string, bool, error) {
	appID = strings.TrimSpace(appID)
	if appID == "" {
		return "", nil, false, fmt.Errorf("app id is required")
	}

	a.checkoutMu.Lock()
	existing, ok := a.checkedOut[appID]
	a.checkoutMu.Unlock()
	if ok {
		// A built-in app reconciles against no baseline, so the shipped content is restored over any edit the agent
		// left behind: those edits can never be pushed, and Reconcile would otherwise preserve them and hand them
		// back as the example's real code on the next checkout.
		base := existing.hashes
		if existing.readOnly {
			base = nil
		}
		// A failed reconcile (offline board) still hands back the mirror: it's stale, but refusing the checkout
		// leaves the agent with nothing, and SyncBack's hashes still stop it overwriting the user's work.
		hashes, parked, err := appmirror.Reconcile(boardFiles{app: a}, existing.appPath, existing.mirror, base)
		if err != nil {
			slog.Warn("agent mirror reconcile failed; reusing the existing mirror", "app", appID, "err", err)
		}
		a.checkoutMu.Lock()
		if cur, tracked := a.checkedOut[appID]; tracked {
			// Adopt the partial baseline even on error: those files were rewritten/parked on disk, and the old hashes would misread them as local edits.
			cur.hashes = hashes
			cur.baselined = cur.baselined || err == nil
			a.checkedOut[appID] = cur
		}
		a.checkoutMu.Unlock()
		if err == nil {
			a.clearConflictIssue(appID) // Reconcile parked any divergence, so the sticky conflict warning is stale now
		}
		return existing.mirror, parked, existing.readOnly, nil
	}

	orchestratorURL, err := a.InferOrchestratorURL()
	if err != nil {
		return "", nil, false, err
	}
	target, err := arduinoapps.ResolveApp(a.ctx(), orchestratorURL, appID)
	if err != nil {
		return "", nil, false, err
	}
	mirror, err := airuntime.MirrorDir(mirrorKey(a.selectedBoardID(), appID))
	if err != nil {
		return "", nil, false, err
	}
	if err := os.MkdirAll(mirror, 0o755); err != nil {
		return "", nil, false, err
	}
	hashes, err := appmirror.Populate(boardFiles{app: a}, target.Path, mirror)
	if err != nil {
		return "", nil, false, err
	}

	a.checkoutMu.Lock()
	a.checkedOut[appID] = checkedApp{appPath: target.Path, mirror: mirror, baseline: time.Now(), hashes: hashes, readOnly: target.ReadOnly, baselined: true}
	a.checkoutMu.Unlock()
	a.clearConflictIssue(appID)
	return mirror, nil, target.ReadOnly, nil
}

// rebindCheckout moves a renamed app's checkout onto its new id: the entry holds the board path and mirror dir, and left behind it strands the pending edits and breaks every permission keyed on that path.
func (a *App) rebindCheckout(oldID, newID string) {
	a.checkoutMu.Lock()
	entry, ok := a.checkedOut[oldID]
	a.checkoutMu.Unlock()
	if !ok {
		return
	}
	mirror, err := airuntime.MirrorDir(mirrorKey(a.selectedBoardID(), newID))
	if err != nil {
		slog.Warn("agent mirror rebind skipped; the renamed app will re-checkout", "app", newID, "err", err)
		return
	}
	orchestratorURL, err := a.InferOrchestratorURL()
	if err != nil {
		slog.Warn("agent mirror rebind skipped; the renamed app will re-checkout", "app", newID, "err", err)
		return
	}
	// Resolved before the move so a lookup failure can't leave the mirror half-renamed.
	target, err := arduinoapps.ResolveApp(a.ctx(), orchestratorURL, newID)
	if err != nil {
		slog.Warn("agent mirror rebind skipped; the renamed app will re-checkout", "app", newID, "err", err)
		return
	}
	if entry.mirror != mirror {
		if err := os.Rename(entry.mirror, mirror); err != nil {
			slog.Warn("agent mirror rename failed; the renamed app will re-checkout", "app", newID, "err", err)
			return
		}
	}
	entry.appPath, entry.mirror = target.Path, mirror
	a.checkoutMu.Lock()
	delete(a.checkedOut, oldID)
	a.checkedOut[newID] = entry
	a.checkoutMu.Unlock()
}

// syncThreshold picks the mtime gate SyncBack should apply. The zero time drops it, leaving the per-file content
// hashes as the only thing deciding what to push — safe only for a baselined mirror, since a reattached one has no
// hashes for its pre-existing files and pushing those unconditionally is the force-push regression B4 was about.
func syncThreshold(since time.Time, c checkedApp, force bool) time.Time {
	if (force || c.dirty) && c.baselined {
		return time.Time{}
	}
	// Without hashes the mtime gate is the only guard, so it stays even under force — the callers pass the zero
	// time there, which would otherwise drop it anyway.
	if c.baseline.After(since) {
		return c.baseline // also skips the initial Populate copy, whose mtime predates the baseline
	}
	return since
}

// syncCheckouts pushes mirror edits back to the board (the watcher refreshes the editor); force ignores the mtime gate. The three outcomes stay apart because they call for different advice: a failed push is transient and self-heals (marked dirty, re-pushed next sync), a conflict never clears by retrying (the agent has to re-checkout), and edits withheld from a built-in app can only ever land in a clone.
func (a *App) syncCheckouts(since time.Time, force bool) (failed, conflicts, withheld map[string]error) {
	a.checkoutMu.Lock()
	snapshot := make(map[string]checkedApp, len(a.checkedOut))
	for id, c := range a.checkedOut {
		snapshot[id] = c
	}
	gen := a.boardGen
	a.checkoutMu.Unlock()

	for appID, c := range snapshot {
		// A turn's deferred sync can outlive the board it was for: writing now would push these files over the next board's connection (X2), so drop it.
		if a.boardChanged(gen) {
			return failed, conflicts, withheld
		}
		// A built-in app's or a release's board copy is read-only: never push, and report the withheld edits so silence can't read as success.
		if c.readOnly {
			if mirrorEditedSince(c.mirror, c.baseline) {
				if withheld == nil {
					withheld = map[string]error{}
				}
				withheld[appID] = fmt.Errorf("this app is read-only on the board (a built-in example, an installed App release, or an app outside the user's apps folder), so these edits were not applied")
			}
			continue
		}
		// A clean checkout with no edits since Populate has nothing to flush — don't rewrite a whole untouched app over the board link.
		if force && !c.dirty && !mirrorEditedSince(c.mirror, c.baseline) {
			continue
		}
		res, err := appmirror.SyncBack(boardFiles{app: a}, c.appPath, c.mirror, syncThreshold(since, c, force), c.hashes)
		a.checkoutMu.Lock()
		if cur, tracked := a.checkedOut[appID]; tracked {
			// Adopt the baseline even on failure: it keeps the advances verified before the error, which a retry would otherwise misread as conflicts.
			cur.hashes = res.NewBase
			cur.dirty = err != nil
			a.checkedOut[appID] = cur
		}
		a.checkoutMu.Unlock()
		// A run can conflict AND fail; the two carry opposite advice, so neither may shadow the other.
		var cErr error
		if len(res.Conflicts) > 0 {
			slog.Warn("agent mirror sync-back conflict", "app", appID, "files", res.Conflicts)
			cErr = fmt.Errorf("changed on the board since checkout, so the agent's edits were not applied: %s (re-run apps_checkout to pick up the board's version; the conflicting edits are preserved next to it as %s files to re-apply)", strings.Join(res.Conflicts, ", "), appmirror.ParkedSuffix)
			if conflicts == nil {
				conflicts = map[string]error{}
			}
			conflicts[appID] = cErr
		}
		a.recordSyncIssue(appID, err, cErr)
		if err != nil {
			slog.Warn("agent mirror sync-back failed", "app", appID, "err", err)
			if failed == nil {
				failed = map[string]error{}
			}
			failed[appID] = err
			continue
		}
		if !force {
			appmirror.RemoveParked(c.mirror) // parked copies are same-turn buffers; mid-turn (force) the agent may not have re-applied them yet
		}
		if force || len(res.Written) > 0 {
			slog.Info("[sync] pushed mirror to board", "app", appID, "force", force, "written", len(res.Written), "conflicts", len(res.Conflicts))
		}
	}
	return failed, conflicts, withheld
}

// workspaceMirrorDir is where an app's checkout lives, computed from the id alone: the permission layer needs it before any checkout exists.
func (a *App) workspaceMirrorDir(appID string) string {
	if strings.TrimSpace(appID) == "" {
		return ""
	}
	dir, err := airuntime.MirrorDir(mirrorKey(a.selectedBoardID(), appID))
	if err != nil {
		return ""
	}
	return dir
}

// mirrorKey turns a board + app id into a filesystem-safe dir name: app ids repeat across boards, so one key alone would reuse board A's mirror for board B's app of the same name. It separates the copies on disk, but doesn't make unflushed edits recoverable — A → B → A finds no checkout entry and re-Populates.
func mirrorKey(boardID, appID string) string {
	if boardID == "" {
		return mirrorAppSegment(appID) // no board identity (SBC/placeholder): app-only key
	}
	san := strings.NewReplacer(":", "-", "/", "-", "\\", "-")
	return san.Replace(boardID) + "__" + mirrorAppSegment(appID)
}

// mirrorAppSegment names the app's mirror dir readably — the agent retypes these paths and raw base64 ids get mangled into stranded ghost dirs — by decoding the id (base64 of "type:name") and suffixing a hash of the raw id so distinct ids never collide through sanitization.
func mirrorAppSegment(appID string) string {
	name := appID
	if dec, err := base64.RawStdEncoding.DecodeString(appID); err == nil {
		name = string(dec)
	} else if dec, err := base64.StdEncoding.DecodeString(appID); err == nil {
		name = string(dec)
	}
	sum := sha256.Sum256([]byte(appID))
	suffix := hex.EncodeToString(sum[:3])
	if seg := sanitizeMirrorSegment(name); seg != "" {
		return seg + "-" + suffix
	}
	return suffix
}

// sanitizeMirrorSegment maps anything outside [A-Za-z0-9._-] to '-', collapses dash runs, trims edge '-'/'.' and caps at 40 chars.
func sanitizeMirrorSegment(s string) string {
	var b strings.Builder
	dash := false
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '.', r == '_':
			b.WriteRune(r)
			dash = false
		case !dash:
			b.WriteByte('-')
			dash = true
		}
	}
	out := strings.Trim(b.String(), "-.")
	if len(out) > 40 {
		out = strings.Trim(out[:40], "-.")
	}
	return out
}

// boardChangedReason marks the teardown reason on the restart event, so the reconnect prompt can explain itself.
const boardChangedReason = "board-changed"

// boardFlashedReason is the flash teardown. It is the same board, so the prompt must not say it changed, and a
// board switch the user confirmed must not be spent reviving the agent onto a board that is still rebooting.
const boardFlashedReason = "board-flashed"

// detachAgentForBoardChange unbinds the agent from the board that is about to be replaced. The order matters: pending
// mirror edits are pushed while the OLD board's connection is still up (afterwards they would land on the new board at
// the old board's paths — X2); then the agent is stopped, both because its system prompt describes the old board (X11)
// and so none of its goroutines reads selectedBoard while it is reassigned (W1); then the checkouts are dropped, since
// they mirror files that belong to the board we are leaving.
// It reports whether an agent was actually torn down; announcing that is the caller's job, and must wait until the new
// board is in place — the frontend restarts the agent on that event, and a restart racing the assignment would snapshot
// the board it was told about (X11 again).
func (a *App) detachAgentForBoardChange() bool {
	// The flush below runs for seconds over the connection, and the answer is read at both ends of it: an agent
	// that crashes out or is stopped in that window still has to be announced, or the sidebar keeps the previous
	// board's chats, and one the user opened during it is torn down here and has to be announced too.
	a.agentMu.Lock()
	running := a.agentMgr != nil
	a.agentMu.Unlock()

	if failed, _, _ := a.syncCheckouts(time.Time{}, true); len(failed) > 0 {
		// The edits stay in the mirror, which is keyed by board, so they are still there if the user comes back.
		slog.Warn("[board] could not flush agent edits before the board change", "apps", flushFailureSummary(failed))
	}
	return a.dropAgent() || running
}

// dropAgent stops the agent and forgets its checkouts without flushing: for a board that was just flashed, a flush would push pre-flash files onto a wiped, rebooting board.
func (a *App) dropAgent() bool {
	a.agentMu.Lock()
	running := a.agentMgr != nil
	a.stopAgentLocked()
	a.agentMu.Unlock()

	a.checkoutMu.Lock()
	a.checkedOut = map[string]checkedApp{}
	a.boardGen++ // anything already in flight for the old board must not land on the new one
	a.checkoutMu.Unlock()

	return running
}

// boardChanged reports whether the selected board was swapped since gen was taken.
func (a *App) boardChanged(gen uint64) bool {
	a.checkoutMu.Lock()
	defer a.checkoutMu.Unlock()
	return a.boardGen != gen
}

// selectedBoardID identifies the selected board for mirror keying (serial, or address for a network board).
func (a *App) selectedBoardID() string {
	sb := a.boardSnapshot()
	return boardIdentity(sb.Info.Serial, sb.Info.Address)
}

// appIDForMirrorKey reverses a mirror dir name to the board app id (mirrorKey is lossy — ':' etc. → '-') by matching the board's app list.
// Returns (id, found, err): err flags a board/list failure so callers can tell it apart from a clean "no such app".
func (a *App) appIDForMirrorKey(orchestratorURL, key string) (string, bool, error) {
	boardID := a.selectedBoardID()
	apps, err := arduinoapps.List(a.ctx(), orchestratorURL)
	if err != nil {
		return "", false, err
	}
	for _, id := range apps {
		if mirrorKey(boardID, id) == key {
			return id, true, nil
		}
	}
	return "", false, nil
}

// mirrorDirClass buckets an edited dir under the mirror root at reattach time.
type mirrorDirClass int

const (
	mirrorDirSkip     mirrorDirClass = iota // dot-dir (.claude is the agent runtime's own), tracked, or a transient board failure
	mirrorDirReattach                       // reverse-maps to a board app: adopt it so its edits sync back
	mirrorDirGhost                          // matches no board app: the agent's edits are stranded off any checkout
)

// classifyMirrorDir decides an edited dir's fate; lookup runs the reverse-map lazily so tracked/dot dirs never hit the board, and its error means "can't tell this turn", never "ghost".
func classifyMirrorDir(name string, tracked bool, lookup func() (bool, error)) mirrorDirClass {
	if tracked || strings.HasPrefix(name, ".") {
		return mirrorDirSkip
	}
	ok, err := lookup()
	switch {
	case err != nil:
		return mirrorDirSkip
	case ok:
		return mirrorDirReattach
	default:
		return mirrorDirGhost
	}
}

// reattachEditedMirrors registers persisted mirror dirs the agent edited this turn but never checked out
// (checkedOut is in-memory), so syncCheckouts propagates their edits back to the board instead of stranding them.
// Edited dirs matching no board app are recorded as ghosts, so tools can warn that those edits are not on the board.
func (a *App) reattachEditedMirrors(since time.Time) {
	root, err := airuntime.MirrorRootDir()
	if err != nil {
		return
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		return
	}
	boardID := a.selectedBoardID()
	a.checkoutMu.Lock()
	gen := a.boardGen
	tracked := make(map[string]bool, len(a.checkedOut))
	for id := range a.checkedOut {
		tracked[mirrorKey(boardID, id)] = true
	}
	a.checkoutMu.Unlock()

	if a.boardChanged(gen) { // see syncCheckouts: don't re-adopt the previous board's mirrors under the new one
		return
	}
	orchestratorURL := ""
	present := make(map[string]bool, len(entries))
	ghosts := map[string]bool{}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		name := e.Name()
		present[name] = true
		mirror := filepath.Join(root, name)
		if !mirrorEditedSince(mirror, since) {
			continue
		}
		var appID string
		switch classifyMirrorDir(name, tracked[name], func() (bool, error) {
			if orchestratorURL == "" {
				u, err := a.InferOrchestratorURL()
				if err != nil {
					return false, err
				}
				orchestratorURL = u
			}
			id, ok, err := a.appIDForMirrorKey(orchestratorURL, name)
			appID = id
			return ok, err
		}) {
		case mirrorDirGhost:
			ghosts[name] = true
		case mirrorDirReattach:
			target, err := arduinoapps.ResolveApp(a.ctx(), orchestratorURL, appID)
			if err != nil {
				continue
			}
			a.checkoutMu.Lock()
			if _, exists := a.checkedOut[appID]; !exists {
				// baseline=since → SyncBack writes only this turn's edits; no hashes → no deletion propagation, and not baselined, so the mtime gate stays.
				a.checkedOut[appID] = checkedApp{appPath: target.Path, mirror: mirror, baseline: since, hashes: map[string]string{}, readOnly: target.ReadOnly}
			}
			delete(a.ghostMirrors, name)
			a.checkoutMu.Unlock()
		}
	}

	a.recordGhostMirrors(present, ghosts)
}

// recordGhostMirrors merges newly-detected ghosts (logging once each) and drops entries whose dir vanished; a
// re-detected ghost re-arms its warning, so the agent hears about each edit burst once instead of forever.
func (a *App) recordGhostMirrors(present, ghosts map[string]bool) {
	a.checkoutMu.Lock()
	defer a.checkoutMu.Unlock()
	for name := range a.ghostMirrors {
		if !present[name] {
			delete(a.ghostMirrors, name)
		}
	}
	for name := range ghosts {
		if _, known := a.ghostMirrors[name]; !known {
			slog.Warn("agent edits are stranded in a mirror dir that matches no board app", "dir", name)
		}
		a.ghostMirrors[name] = false
	}
}

// dueGhostWarnings returns the ghosts whose warning hasn't been delivered yet and marks them delivered.
func (a *App) dueGhostWarnings() []string {
	a.checkoutMu.Lock()
	defer a.checkoutMu.Unlock()
	out := make([]string, 0, len(a.ghostMirrors))
	for name, warned := range a.ghostMirrors {
		if !warned {
			out = append(out, name)
			a.ghostMirrors[name] = true
		}
	}
	sort.Strings(out)
	return out
}

// sweepGhostMirrors is the on-demand (mid-turn) ghost detector: unlike reattachEditedMirrors it never adopts mappable dirs — reattach stays a turn-end concern — it only records stranded ones.
func (a *App) sweepGhostMirrors() {
	a.checkoutMu.Lock()
	since := a.turnStart
	a.checkoutMu.Unlock()
	if since.IsZero() { // no turn ran yet, so nothing was agent-written
		return
	}
	root, err := airuntime.MirrorRootDir()
	if err != nil {
		return
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		return
	}
	boardID := a.selectedBoardID()
	a.checkoutMu.Lock()
	tracked := make(map[string]bool, len(a.checkedOut))
	for id := range a.checkedOut {
		tracked[mirrorKey(boardID, id)] = true
	}
	a.checkoutMu.Unlock()

	orchestratorURL := ""
	present := make(map[string]bool, len(entries))
	ghosts := map[string]bool{}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		name := e.Name()
		present[name] = true
		if !mirrorEditedSince(filepath.Join(root, name), since) {
			continue
		}
		if classifyMirrorDir(name, tracked[name], func() (bool, error) {
			if orchestratorURL == "" {
				u, err := a.InferOrchestratorURL()
				if err != nil {
					return false, err
				}
				orchestratorURL = u
			}
			_, ok, err := a.appIDForMirrorKey(orchestratorURL, name)
			return ok, err
		}) == mirrorDirGhost {
			ghosts[name] = true
		}
	}
	a.recordGhostMirrors(present, ghosts)
}

// pendingGhostEdits sweeps for ghosts written this turn before snapshotting — apps_start/apps_clone/board_exec fire mid-turn, and the turn-end sweep would warn one turn too late — returning the dirs sorted so warnings render stably.
func (a *App) pendingGhostEdits() []string {
	a.sweepGhostMirrors()
	return a.dueGhostWarnings()
}

// syncIssue holds an app's pending sync warnings: the failure half clears on any clean sync, the conflict half only
// on a successful re-checkout — a quiet sync proves nothing about a conflict its mtime gate never re-read.
type syncIssue struct {
	fail     string
	conflict string
}

// recordSyncIssue keeps the latest sync failure/conflict per app for tool-result warnings; a clean sync clears only the failure half.
func (a *App) recordSyncIssue(appID string, failed, conflict error) {
	a.checkoutMu.Lock()
	defer a.checkoutMu.Unlock()
	cur := a.pendingSyncIssues[appID]
	cur.fail = ""
	if failed != nil {
		cur.fail = fmt.Sprintf("warning: edits to app %s from a previous turn did NOT reach the board: %v — they will be re-pushed automatically at the next sync or app start; check the board connection.", appID, failed)
	}
	if conflict != nil {
		cur.conflict = fmt.Sprintf("warning: edits to app %s from a previous turn did NOT reach the board: %v", appID, conflict)
	}
	if cur == (syncIssue{}) {
		delete(a.pendingSyncIssues, appID)
		return
	}
	a.pendingSyncIssues[appID] = cur
}

// clearConflictIssue drops an app's sticky conflict warning: a successful (re-)checkout is what actually resolves it.
func (a *App) clearConflictIssue(appID string) {
	a.checkoutMu.Lock()
	defer a.checkoutMu.Unlock()
	cur, ok := a.pendingSyncIssues[appID]
	if !ok {
		return
	}
	cur.conflict = ""
	if cur == (syncIssue{}) {
		delete(a.pendingSyncIssues, appID)
		return
	}
	a.pendingSyncIssues[appID] = cur
}

// pendingSyncWarnings snapshots the per-app sync warnings, sorted by app id so they render stably.
func (a *App) pendingSyncWarnings() []string {
	a.checkoutMu.Lock()
	defer a.checkoutMu.Unlock()
	ids := make([]string, 0, len(a.pendingSyncIssues))
	for id := range a.pendingSyncIssues {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		iss := a.pendingSyncIssues[id]
		if iss.fail != "" {
			out = append(out, iss.fail)
		}
		if iss.conflict != "" {
			out = append(out, iss.conflict)
		}
	}
	return out
}

// mirrorEditedSince reports whether any file under mirror was modified at/after since.
func mirrorEditedSince(mirror string, since time.Time) bool {
	edited := false
	_ = filepath.Walk(mirror, func(_ string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		if !info.ModTime().Before(since) {
			edited = true
			return filepath.SkipAll // one edited file is enough; stop walking the rest of the tree
		}
		return nil
	})
	return edited
}
