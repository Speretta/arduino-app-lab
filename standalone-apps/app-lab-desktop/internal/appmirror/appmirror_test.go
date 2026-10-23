package appmirror

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// fakeBoard records mirror→board calls; failWrites/failPath make writes fail, silentWrites makes them lie (nil error, nothing stored).
type fakeBoard struct {
	writes       map[string]string
	contents     map[string]string // board-side content per path, for the three-way checks; absent → "content"
	dirs         []string
	removed      []string
	failWrites   bool
	failPath     string
	silentWrites bool
	list         []string // served by ListFiles (Populate tests)
	listErr      error    // served alongside list, for the partial-walk case
}

func newFakeBoard() *fakeBoard {
	return &fakeBoard{writes: map[string]string{}, contents: map[string]string{}}
}

func (f *fakeBoard) ListFiles(string) ([]string, error) { return f.list, f.listErr }
func (f *fakeBoard) ReadFile(p string) (string, error) {
	if c, ok := f.writes[p]; ok { // what a sync wrote is what a read-back must see
		return c, nil
	}
	if c, ok := f.contents[p]; ok {
		return c, nil
	}
	return "content", nil
}
func (f *fakeBoard) WriteFile(path, content string) error {
	if f.failWrites || path == f.failPath {
		return os.ErrPermission
	}
	if f.silentWrites {
		return nil
	}
	f.writes[path] = content
	return nil
}
func (f *fakeBoard) MkDirAll(path string) error { f.dirs = append(f.dirs, path); return nil }
func (f *fakeBoard) RemoveFile(path string) error {
	f.removed = append(f.removed, path)
	return nil
}

func writeLocal(t *testing.T, root, rel, content string) {
	t.Helper()
	p := filepath.Join(root, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

// New local subdirectories must be created on the board before their files are written,
// or the whole sync aborts (the board write seam can't create parent dirs itself).
func TestSyncBackCreatesNewBoardDirs(t *testing.T) {
	local := t.TempDir()
	writeLocal(t, local, "app.yaml", "name: x")
	writeLocal(t, local, "assets/app.js", "js")
	writeLocal(t, local, "assets/libs/socket.js", "lib")

	board := newFakeBoard()
	res, err := SyncBack(board, "/apps/demo", local, time.Time{}, nil)
	if err != nil {
		t.Fatalf("SyncBack: %v", err)
	}
	if len(res.Written) != 3 {
		t.Fatalf("written = %v, want 3 files", res.Written)
	}
	wantDirs := map[string]bool{"/apps/demo/assets": true, "/apps/demo/assets/libs": true}
	for _, d := range board.dirs {
		if !wantDirs[d] {
			t.Fatalf("unexpected MkDirAll(%q) (dirs: %v)", d, board.dirs)
		}
		delete(wantDirs, d)
	}
	if len(wantDirs) > 0 {
		t.Fatalf("missing MkDirAll for %v (got %v)", wantDirs, board.dirs)
	}
	if board.writes["/apps/demo/assets/libs/socket.js"] != "lib" {
		t.Fatalf("nested file not written: %v", board.writes)
	}
	for _, rel := range []string{"app.yaml", "assets/app.js", "assets/libs/socket.js"} {
		if res.NewBase[rel] == "" {
			t.Fatalf("NewBase missing %q: %v", rel, res.NewBase)
		}
	}
}

// A write failure must abort before deletions and keep the old baseline.
func TestSyncBackWriteFailureSkipsDeletions(t *testing.T) {
	local := t.TempDir()
	writeLocal(t, local, "main.py", "edited")

	board := newFakeBoard()
	board.failWrites = true
	board.contents["/apps/demo/main.py"] = "code" // board still holds the checked-out copy, so it's an edit, not a conflict
	base := map[string]string{"main.py": contentHash([]byte("code")), "gone.py": contentHash([]byte("old"))}
	res, err := SyncBack(board, "/apps/demo", local, time.Time{}, base)
	if err == nil {
		t.Fatal("want error from failing write")
	}
	if len(res.Deleted) != 0 || len(board.removed) != 0 {
		t.Fatalf("deletions ran after a failed write: %v", board.removed)
	}
	if res.NewBase["gone.py"] != base["gone.py"] {
		t.Fatalf("baseline not preserved on failure: %v", res.NewBase)
	}
}

// A case-colliding board listing must be refused before anything is written, or SyncBack later deletes a board file (W6).
func TestPopulateRefusesCaseCollision(t *testing.T) {
	local := t.TempDir()
	if !foldsCase(local) {
		t.Skip("case-sensitive filesystem: both files mirror fine, no refusal expected")
	}
	board := newFakeBoard()
	board.list = []string{"/apps/demo/README.md", "/apps/demo/readme.md"}
	_, err := Populate(board, "/apps/demo", local)
	if err == nil {
		t.Fatal("want refusal for case-colliding names")
	}
	for _, name := range []string{`"README.md"`, `"readme.md"`, "ask"} {
		if !strings.Contains(err.Error(), name) {
			t.Fatalf("error should contain %s: %v", name, err)
		}
	}
	if entries, _ := os.ReadDir(local); len(entries) != 0 {
		t.Fatalf("refusal must precede any local write, found %v", entries)
	}
}

func TestCaseCollision(t *testing.T) {
	if a, b := caseCollision([]string{"src/main.py", "app.yaml"}); a != "" {
		t.Fatalf("false positive: %q %q", a, b)
	}
	if a, b := caseCollision([]string{"a/x.md", "b/X.md"}); a != "" {
		t.Fatalf("same folded name under different dirs is not a collision: %q %q", a, b)
	}
	if a, b := caseCollision([]string{"README.md", "readme.md"}); a != "README.md" || b != "readme.md" {
		t.Fatalf("missed file pair: %q %q", a, b)
	}
	if a, b := caseCollision([]string{"Docs", "docs/x"}); a != "docs/" || b != "Docs" {
		t.Fatalf("missed file-vs-dir clash: %q %q", a, b)
	}
}

func TestWinIllegal(t *testing.T) {
	for rel, want := range map[string]bool{
		"src/main.py": false, "app.yaml": false, "conf.py": false,
		"a:b.txt": true, "what?.md": true, "con": true, "CON.txt": true, "sub/nul.log": true,
		"trailing./x": true, "trailing ": true, `back\slash`: true,
	} {
		if got := winIllegal(rel); got != want {
			t.Fatalf("winIllegal(%q) = %v, want %v", rel, got, want)
		}
	}
}

// Files deleted locally (in the baseline, absent from the mirror) are removed from the board.
func TestSyncBackPropagatesDeletions(t *testing.T) {
	local := t.TempDir()
	writeLocal(t, local, "main.py", "code")

	board := newFakeBoard()
	board.contents["/apps/demo/old.py"] = "old" // untouched on the board since checkout, so deleting it is safe
	base := map[string]string{"main.py": contentHash([]byte("code")), "old.py": contentHash([]byte("old"))}
	res, err := SyncBack(board, "/apps/demo", local, time.Time{}, base)
	if err != nil {
		t.Fatalf("SyncBack: %v", err)
	}
	if len(res.Deleted) != 1 || res.Deleted[0] != "/apps/demo/old.py" {
		t.Fatalf("deleted = %v, want [/apps/demo/old.py]", res.Deleted)
	}
	if _, still := res.NewBase["old.py"]; still {
		t.Fatalf("NewBase still lists the deleted file: %v", res.NewBase)
	}
}

// B4: a force sync drops the mtime gate, so only the content hashes stop it from re-pushing the whole mirror over
// what the user saved in the editor since checkout.
func TestSyncBackForceKeepsBoardEditsToUntouchedFiles(t *testing.T) {
	local := t.TempDir()
	writeLocal(t, local, "main.py", "agent edit")   // the agent edited this one
	writeLocal(t, local, "app.yaml", "checked out") // untouched in the mirror since checkout
	board := newFakeBoard()
	board.contents["/apps/demo/main.py"] = "original" // still as checked out
	board.contents["/apps/demo/app.yaml"] = "user saved this in the editor"
	base := map[string]string{
		"main.py":  contentHash([]byte("original")),
		"app.yaml": contentHash([]byte("checked out")),
	}

	res, err := SyncBack(board, "/apps/demo", local, time.Time{}, base) // zero time = the force path
	if err != nil {
		t.Fatalf("SyncBack: %v", err)
	}
	if _, overwritten := board.writes["/apps/demo/app.yaml"]; overwritten {
		t.Error("a file untouched in the mirror was pushed, reverting the user's editor save")
	}
	if len(res.Conflicts) != 0 {
		t.Errorf("a file the agent never touched is not a conflict, got %v", res.Conflicts) // it must be skipped outright, not fall through to the board comparison
	}
	if board.writes["/apps/demo/main.py"] != "agent edit" {
		t.Errorf("the agent's own edit was not pushed: %v", board.writes)
	}
	if res.NewBase["app.yaml"] != base["app.yaml"] {
		t.Errorf("an untouched file must keep its baseline, got %v", res.NewBase)
	}
}

// Both sides edited the file since checkout: report it and leave the board alone rather than pick a winner.
func TestSyncBackReportsConflictInsteadOfOverwriting(t *testing.T) {
	local := t.TempDir()
	writeLocal(t, local, "main.py", "agent edit")
	board := newFakeBoard()
	board.contents["/apps/demo/main.py"] = "user edit" // moved under us
	base := map[string]string{"main.py": contentHash([]byte("original"))}

	res, err := SyncBack(board, "/apps/demo", local, time.Time{}, base)
	if err != nil {
		t.Fatalf("SyncBack: %v", err)
	}
	if len(res.Conflicts) != 1 || res.Conflicts[0] != "main.py" {
		t.Fatalf("conflicts = %v, want [main.py]", res.Conflicts)
	}
	if _, overwritten := board.writes["/apps/demo/main.py"]; overwritten {
		t.Error("a conflicting file was overwritten on the board")
	}
	if res.NewBase["main.py"] != base["main.py"] {
		t.Error("an unresolved conflict must keep its baseline so the next sync re-detects it")
	}
}

// Deleting is as destructive as overwriting: a file changed on the board must not be removed to propagate a local delete.
func TestSyncBackDoesNotDeleteAFileChangedOnTheBoard(t *testing.T) {
	local := t.TempDir()
	writeLocal(t, local, "main.py", "code")
	board := newFakeBoard()
	board.contents["/apps/demo/notes.md"] = "the user rewrote this"
	base := map[string]string{"main.py": contentHash([]byte("code")), "notes.md": contentHash([]byte("old notes"))}

	res, err := SyncBack(board, "/apps/demo", local, time.Time{}, base)
	if err != nil {
		t.Fatalf("SyncBack: %v", err)
	}
	if len(board.removed) != 0 {
		t.Errorf("removed a file the user had changed on the board: %v", board.removed)
	}
	if len(res.Conflicts) != 1 || res.Conflicts[0] != "notes.md" {
		t.Fatalf("conflicts = %v, want [notes.md]", res.Conflicts)
	}
}

// A re-checkout must show the agent the board's current content, but never discard its pending edits.
func TestReconcileRefreshesOnlyUntouchedFiles(t *testing.T) {
	local := t.TempDir()
	writeLocal(t, local, "main.py", "agent edit")   // edited locally → keep
	writeLocal(t, local, "app.yaml", "checked out") // untouched → refresh from the board
	writeLocal(t, local, "gone.py", "obsolete")     // no longer on the board → drop
	board := newFakeBoard()
	board.list = []string{"/apps/demo/main.py", "/apps/demo/app.yaml", "/apps/demo/new.py"}
	board.contents["/apps/demo/main.py"] = "original"
	board.contents["/apps/demo/app.yaml"] = "user saved this in the editor"
	board.contents["/apps/demo/new.py"] = "added in the editor"
	base := map[string]string{
		"main.py":  contentHash([]byte("original")),
		"app.yaml": contentHash([]byte("checked out")),
		"gone.py":  contentHash([]byte("obsolete")),
	}

	next, parked, err := Reconcile(board, "/apps/demo", local, base)
	if err != nil {
		t.Fatalf("Reconcile: %v", err)
	}
	if len(parked) != 0 {
		t.Fatalf("nothing should be parked when the board side is unchanged: %v", parked)
	}
	for rel, want := range map[string]string{
		"main.py":  "agent edit",                    // pending edit survives
		"app.yaml": "user saved this in the editor", // refreshed
		"new.py":   "added in the editor",           // added
	} {
		got, err := os.ReadFile(filepath.Join(local, rel))
		if err != nil {
			t.Fatalf("read %s: %v", rel, err)
		}
		if string(got) != want {
			t.Errorf("%s = %q, want %q", rel, got, want)
		}
	}
	if _, err := os.Stat(filepath.Join(local, "gone.py")); !os.IsNotExist(err) {
		t.Errorf("a file deleted on the board should not linger in the mirror (err=%v)", err)
	}
	if next["main.py"] != base["main.py"] {
		t.Error("a locally edited file must keep its checkout baseline, so SyncBack can still tell it was edited")
	}
	if next["app.yaml"] != contentHash([]byte("user saved this in the editor")) {
		t.Error("a refreshed file must be re-baselined to the board's content")
	}
}

// A built-in app's checkout passes no baseline so the shipped files win: with a baseline, Reconcile preserves a
// locally-diverged file for SyncBack to judge, and for a read-only app SyncBack never runs to judge it.
func TestReconcileWithoutBaselineRestoresBoardContent(t *testing.T) {
	local := t.TempDir()
	if err := os.WriteFile(filepath.Join(local, "main.py"), []byte("agent's edit"), 0o644); err != nil {
		t.Fatal(err)
	}
	board := newFakeBoard()
	board.list = []string{"/ex/main.py"}
	board.contents["/ex/main.py"] = "shipped"

	if _, _, err := Reconcile(board, "/ex", local, nil); err != nil {
		t.Fatalf("reconcile: %v", err)
	}

	got, err := os.ReadFile(filepath.Join(local, "main.py"))
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "shipped" {
		t.Errorf("mirror holds %q, want the board's shipped content", got)
	}
}

// Both sides moved since checkout: a re-checkout resolves it — board wins, the local edit is parked as
// .claude-local, the baseline follows the board — so the next SyncBack has nothing left to push or report.
func TestReconcileParksConflictingEditAndRebaselines(t *testing.T) {
	local := t.TempDir()
	writeLocal(t, local, "main.py", "agent edit")
	board := newFakeBoard()
	board.list = []string{"/apps/demo/main.py"}
	board.contents["/apps/demo/main.py"] = "board rewrite"
	base := map[string]string{"main.py": contentHash([]byte("original"))}

	next, parked, err := Reconcile(board, "/apps/demo", local, base)
	if err != nil {
		t.Fatalf("Reconcile: %v", err)
	}
	if len(parked) != 1 || parked[0] != "main.py" {
		t.Fatalf("parked = %v, want [main.py]", parked)
	}
	if got, _ := os.ReadFile(filepath.Join(local, "main.py")); string(got) != "board rewrite" {
		t.Errorf("real file = %q, want the board's version", got)
	}
	if got, _ := os.ReadFile(filepath.Join(local, "main.py"+ParkedSuffix)); string(got) != "agent edit" {
		t.Errorf("parked copy = %q, want the displaced local edit", got)
	}
	if next["main.py"] != contentHash([]byte("board rewrite")) {
		t.Error("baseline must follow the board's content after the resolution")
	}

	res, err := SyncBack(board, "/apps/demo", local, time.Time{}, next)
	if err != nil {
		t.Fatalf("SyncBack: %v", err)
	}
	if len(res.Written) != 0 || len(res.Conflicts) != 0 {
		t.Errorf("resolved file must be in sync: written=%v conflicts=%v", res.Written, res.Conflicts)
	}
}

// Parked copies are mirror-local bookkeeping: SyncBack must never push one to the board or delete one from it.
func TestSyncBackIgnoresParkedFiles(t *testing.T) {
	local := t.TempDir()
	writeLocal(t, local, "main.py", "code")
	writeLocal(t, local, "main.py"+ParkedSuffix, "displaced edit")
	board := newFakeBoard()
	board.contents["/apps/demo/main.py"] = "code"
	base := map[string]string{"main.py": contentHash([]byte("code"))}

	res, err := SyncBack(board, "/apps/demo", local, time.Time{}, base)
	if err != nil {
		t.Fatalf("SyncBack: %v", err)
	}
	if len(board.writes) != 0 {
		t.Errorf("a parked file was pushed to the board: %v", board.writes)
	}
	if len(board.removed) != 0 || len(res.Deleted) != 0 {
		t.Errorf("a parked file triggered deletion bookkeeping: %v %v", board.removed, res.Deleted)
	}
	if _, tracked := res.NewBase["main.py"+ParkedSuffix]; tracked {
		t.Errorf("a parked file entered the baseline: %v", res.NewBase)
	}
}

// A write that returns nil but doesn't persist must fail the sync and leave the baseline alone: advancing it
// would mark the file "in sync" forever — never re-pushed, and reverted by the next Reconcile.
func TestSyncBackDetectsSilentWriteFailure(t *testing.T) {
	local := t.TempDir()
	writeLocal(t, local, "main.py", "edited")
	board := newFakeBoard()
	board.silentWrites = true
	board.contents["/apps/demo/main.py"] = "code" // the stale copy the lying write never replaced
	base := map[string]string{"main.py": contentHash([]byte("code"))}

	res, err := SyncBack(board, "/apps/demo", local, time.Time{}, base)
	if err == nil || !strings.Contains(err.Error(), "did not persist") {
		t.Fatalf("want a did-not-persist error, got %v", err)
	}
	if res.NewBase["main.py"] != base["main.py"] {
		t.Fatalf("baseline advanced for an unverified write: %v", res.NewBase)
	}
}

// A per-file failure must not strand the rest of the run: later files still land and keep their verified
// baseline advances, and the failed file alone is re-pushed on retry — never misread as a conflict.
func TestSyncBackKeepsVerifiedAdvancesOnMidRunFailure(t *testing.T) {
	local := t.TempDir()
	writeLocal(t, local, "a.py", "a edited")
	writeLocal(t, local, "b.py", "b edited")
	board := newFakeBoard()
	board.failPath = "/apps/demo/a.py" // fails first; b.py must still be pushed
	board.contents["/apps/demo/a.py"] = "a orig"
	board.contents["/apps/demo/b.py"] = "b orig"
	base := map[string]string{"a.py": contentHash([]byte("a orig")), "b.py": contentHash([]byte("b orig"))}

	res, err := SyncBack(board, "/apps/demo", local, time.Time{}, base)
	if err == nil {
		t.Fatal("want error from the failing write")
	}
	if board.writes["/apps/demo/b.py"] != "b edited" {
		t.Fatalf("a failure must not strand later files: %v", board.writes)
	}
	if res.NewBase["b.py"] != contentHash([]byte("b edited")) {
		t.Fatalf("a verified write lost its baseline advance: %v", res.NewBase)
	}
	if res.NewBase["a.py"] != base["a.py"] {
		t.Fatalf("the failed write must keep its old baseline: %v", res.NewBase)
	}

	board.failPath = ""
	res2, err := SyncBack(board, "/apps/demo", local, time.Time{}, res.NewBase)
	if err != nil {
		t.Fatalf("retry: %v", err)
	}
	if len(res2.Conflicts) != 0 {
		t.Fatalf("retry misreported already-synced files as conflicts: %v", res2.Conflicts)
	}
	if len(res2.Written) != 1 || res2.Written[0] != "/apps/demo/a.py" {
		t.Fatalf("retry must push only the failed file, wrote %v", res2.Written)
	}
}

// Deleted locally while the board changed since checkout: the board copy is restored, nothing to park.
func TestReconcileRestoresBoardCopyWhenLocalDeleted(t *testing.T) {
	local := t.TempDir()
	board := newFakeBoard()
	board.list = []string{"/apps/demo/main.py"}
	board.contents["/apps/demo/main.py"] = "board rewrite"
	base := map[string]string{"main.py": contentHash([]byte("original"))}

	next, parked, err := Reconcile(board, "/apps/demo", local, base)
	if err != nil {
		t.Fatalf("Reconcile: %v", err)
	}
	if len(parked) != 0 {
		t.Fatalf("a deleted file leaves nothing to park: %v", parked)
	}
	if got, err := os.ReadFile(filepath.Join(local, "main.py")); err != nil || string(got) != "board rewrite" {
		t.Errorf("board copy not restored: %q (%v)", got, err)
	}
	if next["main.py"] != contentHash([]byte("board rewrite")) {
		t.Error("baseline must follow the restored board content")
	}
}

// Turn-end cleanup removes the parked copies (same-turn buffers) and touches nothing else.
func TestRemoveParkedLeavesRealFiles(t *testing.T) {
	local := t.TempDir()
	writeLocal(t, local, "main.py", "code")
	writeLocal(t, local, "main.py"+ParkedSuffix, "displaced edit")
	writeLocal(t, local, "sub/app.yaml", "y")
	writeLocal(t, local, "sub/app.yaml"+ParkedSuffix, "old y")

	RemoveParked(local)

	for _, rel := range []string{"main.py", "sub/app.yaml"} {
		if _, err := os.Stat(filepath.Join(local, filepath.FromSlash(rel))); err != nil {
			t.Errorf("real file %s touched by cleanup: %v", rel, err)
		}
		if _, err := os.Stat(filepath.Join(local, filepath.FromSlash(rel)+ParkedSuffix)); !os.IsNotExist(err) {
			t.Errorf("parked copy %s not removed (err=%v)", rel+ParkedSuffix, err)
		}
	}
}

func TestReconcileParksUntrackedEdits(t *testing.T) {
	local := t.TempDir()
	writeLocal(t, local, "main.py", "stranded agent edit")
	board := newFakeBoard()
	board.list = []string{"/apps/demo/main.py"}
	board.contents["/apps/demo/main.py"] = "board content"

	// Empty non-nil base = a reattached mirror: the stranded edit is parked, never silently overwritten.
	next, parked, err := Reconcile(board, "/apps/demo", local, map[string]string{})
	if err != nil {
		t.Fatalf("Reconcile: %v", err)
	}
	if len(parked) != 1 || parked[0] != "main.py" {
		t.Fatalf("parked = %v, want [main.py]", parked)
	}
	if got, _ := os.ReadFile(filepath.Join(local, "main.py")); string(got) != "board content" {
		t.Errorf("real file = %q, want the board's version", got)
	}
	if got, _ := os.ReadFile(filepath.Join(local, "main.py"+ParkedSuffix)); string(got) != "stranded agent edit" {
		t.Errorf("parked copy = %q, want the stranded edit", got)
	}
	if next["main.py"] != contentHash([]byte("board content")) {
		t.Error("baseline must track the restored board content")
	}

	// nil base is the read-only restore: same difference, deliberately no parking.
	writeLocal(t, local, "main.py", "stranded agent edit")
	_ = os.Remove(filepath.Join(local, "main.py"+ParkedSuffix))
	if _, parked, err := Reconcile(board, "/apps/demo", local, nil); err != nil || len(parked) != 0 {
		t.Fatalf("nil-base reconcile: parked=%v err=%v, want no parking", parked, err)
	}
}

// partialList is what a walk that lost a subtree looks like across the BoardFS seam (fs.UnreadableDirsError).
type partialList struct{ dirs []string }

func (e partialList) Error() string             { return "could not list: " + strings.Join(e.dirs, ", ") }
func (e partialList) UnreadablePaths() []string { return e.dirs }

// One folder the board won't let us list (a root-owned .venv, say) used to fail the whole checkout, leaving the
// agent with no mirror at all. The rest of the app is mirrored instead, and the missing paths stay out of the
// baseline, so SyncBack neither pushes nor deletes them.
func TestPopulateMirrorsWhatTheWalkCouldRead(t *testing.T) {
	local := t.TempDir()
	board := newFakeBoard()
	board.list = []string{"/apps/demo/app.yaml", "/apps/demo/main.py"}
	board.listErr = partialList{dirs: []string{"/apps/demo/.venv"}}

	base, err := Populate(board, "/apps/demo", local)
	if err != nil {
		t.Fatalf("a partial walk must still check the app out: %v", err)
	}
	for _, rel := range []string{"app.yaml", "main.py"} {
		if base[rel] == "" {
			t.Errorf("baseline missing %q: %v", rel, base)
		}
		if _, err := os.Stat(filepath.Join(local, rel)); err != nil {
			t.Errorf("%q not mirrored: %v", rel, err)
		}
	}
	if _, ok := base[".venv/pyvenv.cfg"]; ok {
		t.Error("the unreadable subtree must not appear in the baseline")
	}
}

// A connection that failed outright is still fatal: an empty listing there would mirror an empty app and let
// SyncBack read every board file as deleted.
func TestPopulateFailsWhenTheWalkFailed(t *testing.T) {
	board := newFakeBoard()
	board.listErr = errors.New("ssh: rejected: connect failed (open failed)")

	if _, err := Populate(board, "/apps/demo", t.TempDir()); err == nil {
		t.Fatal("want an error when the board could not be walked at all")
	}
}
