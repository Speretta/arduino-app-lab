package app

import (
	"encoding/base64"
	"errors"
	"mime"
	"os"
	"path"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/arduino/arduino-app-cli/pkg/board/remote"

	"app-lab-desktop/internal/board"
	"app-lab-desktop/internal/fs"
)

// The zero threshold hands the whole decision to the per-file content hashes, so it may only be returned when the
// mirror actually has them: dropping the mtime gate without a baseline is the B4 force-push that reverted the
// user's editor saves. The force callers already pass the zero time, so a missing guard here would be invisible.
func TestSyncThreshold(t *testing.T) {
	baseline := time.Now().Add(-time.Hour)
	earlier, later := baseline.Add(-30*time.Minute), baseline.Add(30*time.Minute)

	for name, tc := range map[string]struct {
		since time.Time
		app   checkedApp
		force bool
		want  time.Time
	}{
		"force on a baselined mirror lets the hashes decide": {
			time.Time{}, checkedApp{baseline: baseline, baselined: true}, true, time.Time{},
		},
		"a dirty baselined mirror re-pushes every edit": {
			later, checkedApp{baseline: baseline, baselined: true, dirty: true}, false, time.Time{},
		},
		"force on a reattached mirror still gates on mtime": { // no hashes to gate on: B4 would push the whole mirror
			time.Time{}, checkedApp{baseline: baseline}, true, baseline,
		},
		"a dirty reattached mirror also keeps the gate": {
			time.Time{}, checkedApp{baseline: baseline, dirty: true}, true, baseline,
		},
		"an older window falls back to the baseline": { // skips the initial Populate copy, whose mtime predates it
			earlier, checkedApp{baseline: baseline, baselined: true}, false, baseline,
		},
		"a later turn window wins over the baseline": {
			later, checkedApp{baseline: baseline, baselined: true}, false, later,
		},
	} {
		if got := syncThreshold(tc.since, tc.app, tc.force); !got.Equal(tc.want) {
			t.Errorf("%s: threshold = %v, want %v", name, got, tc.want)
		}
	}
}

// X2: app ids repeat across boards, so the mirror dir must not be shared between them — switching board would
// otherwise reuse board A's mirror for board B's app of the same name, and Populate would overwrite A's pending edits.
func TestMirrorKeyIsPerBoard(t *testing.T) {
	a := mirrorKey("AAAA1111", "user:blink")
	b := mirrorKey("BBBB2222", "user:blink")
	if a == b {
		t.Fatalf("same key for two boards: %q", a)
	}
	for _, key := range []string{a, b} {
		if strings.ContainsAny(key, `:/\`) {
			t.Errorf("key %q is not filesystem-safe", key)
		}
	}
	// A board with no identity (SBC/placeholder) keys by app alone — no board prefix.
	if got := mirrorKey("", "user:blink"); strings.Contains(got, "__") {
		t.Errorf("unkeyed mirror = %q, want no board prefix", got)
	}
}

// The agent retypes mirror paths, and raw base64 ids get mangled (a mistyped Write strands edits in a ghost dir),
// so the key embeds the decoded id; the hash of the raw id keeps distinct ids distinct through lossy sanitization.
func TestMirrorKeyReadableAndUnique(t *testing.T) {
	enc := func(s string) string { return base64.RawStdEncoding.EncodeToString([]byte(s)) }

	key := mirrorKey("331030603", "dXNlcjplZGdlLWFpLXZvaWNlLWFzc2lzdGFudA") // base64("user:edge-ai-voice-assistant")
	prefix := "331030603__user-edge-ai-voice-assistant-"
	if !strings.HasPrefix(key, prefix) || len(key) != len(prefix)+6 {
		t.Errorf("key = %q, want %s + 6 hex chars", key, prefix)
	}

	// Distinct raw ids whose sanitized names collide must still get distinct keys.
	a, b := mirrorKey("", enc("user:my app")), mirrorKey("", enc("user:my:app"))
	if a == b {
		t.Fatalf("colliding sanitized names share a key: %q", a)
	}
	if !strings.HasPrefix(a, "user-my-app-") || !strings.HasPrefix(b, "user-my-app-") {
		t.Errorf("sanitized names = %q, %q, want user-my-app-*", a, b)
	}

	// A padded id decodes too; a non-base64 id falls back to the sanitized raw id (still hash-suffixed).
	if got := mirrorKey("", "dXNlcjpibGluaw=="); !strings.HasPrefix(got, "user-blink-") {
		t.Errorf("padded id = %q, want user-blink-*", got)
	}
	if got := mirrorKey("", "user:blink"); !strings.HasPrefix(got, "user-blink-") || len(got) != len("user-blink-")+6 {
		t.Errorf("non-base64 id = %q, want the sanitized raw id + hash", got)
	}

	// Long names are capped (40 chars + hash) and every key stays filesystem-safe.
	long := mirrorKey("", enc("user:"+strings.Repeat("very-long-name-", 10)))
	if len(long) > 40+1+6 {
		t.Errorf("long key = %q (%d chars), want at most 47", long, len(long))
	}
	for _, k := range []string{key, a, b, long} {
		if strings.ContainsAny(k, `:/\ `) {
			t.Errorf("key %q is not filesystem-safe", k)
		}
	}
}

// A built-in app is mirrored so the agent can read it, but its board copy ships with the product and the editor
// cannot undo a change to it — so sync must withhold the edits and report them, never push and never stay silent.
func TestSyncCheckoutsWithholdsBuiltInEdits(t *testing.T) {
	edited, untouched := t.TempDir(), t.TempDir()
	baseline := time.Now().Add(-time.Hour)
	if err := os.WriteFile(filepath.Join(edited, "main.py"), []byte("print('edited')"), 0o644); err != nil {
		t.Fatal(err)
	}

	a := &App{checkedOut: map[string]checkedApp{
		"builtin-edited":    {appPath: "/var/lib/arduino-app-cli/examples/inspirational/blink", mirror: edited, baseline: baseline, hashes: map[string]string{}, readOnly: true, baselined: true},
		"builtin-untouched": {appPath: "/var/lib/arduino-app-cli/examples/bricks/arduino/x", mirror: untouched, baseline: baseline, hashes: map[string]string{}, readOnly: true, baselined: true},
	}}

	// A board write would panic on the nil connection, so reaching SyncBack at all is itself the failure signal.
	failed, conflicts, withheld := a.syncCheckouts(time.Time{}, true)

	if len(failed) > 0 || len(conflicts) > 0 {
		t.Errorf("built-in apps reported as failed/conflicted: %v / %v", failed, conflicts)
	}
	if withheld["builtin-edited"] == nil {
		t.Error("edits to a built-in app were dropped without telling the agent")
	}
	if withheld["builtin-untouched"] != nil {
		t.Error("an unedited built-in app should not report withheld edits")
	}
}

// Only a clean "no board app matches" verdict makes a ghost: a reverse-map error is transient (the board or its
// app list was unreadable), and tracked or dot dirs (.claude is the agent runtime's own) are never even looked up.
func TestClassifyMirrorDir(t *testing.T) {
	noLookup := func() (bool, error) { t.Fatal("lookup ran for a dir that should be pre-skipped"); return false, nil }
	for name, tc := range map[string]struct {
		dir     string
		tracked bool
		lookup  func() (bool, error)
		want    mirrorDirClass
	}{
		"dot dirs like .claude are never ghosts":        {".claude", false, noLookup, mirrorDirSkip},
		"tracked dirs are already checked out":          {"B1__user-blink-abc123", true, noLookup, mirrorDirSkip},
		"a reverse-map error is transient, not a ghost": {"B1__user-blink-abc123", false, func() (bool, error) { return false, errors.New("board offline") }, mirrorDirSkip},
		"no matching board app means a ghost":           {"B1__user-blnk-typo00", false, func() (bool, error) { return false, nil }, mirrorDirGhost},
		"a matching app is reattached":                  {"B1__user-blink-abc123", false, func() (bool, error) { return true, nil }, mirrorDirReattach},
	} {
		if got := classifyMirrorDir(tc.dir, tc.tracked, tc.lookup); got != tc.want {
			t.Errorf("%s: classify = %v, want %v", name, got, tc.want)
		}
	}
}

// A failed or conflicted sync must outlive slog: the warning stays per app (latest outcome wins) until that
// app's next clean sync, so the agent's next tool call corrects its "edits landed" belief.
func TestRecordSyncIssue(t *testing.T) {
	a := &App{pendingSyncIssues: map[string]syncIssue{}}

	a.recordSyncIssue("user:app", errors.New("dial tcp: timeout"), nil)
	if w := a.pendingSyncWarnings(); len(w) != 1 || !strings.Contains(w[0], "did NOT reach the board") || !strings.Contains(w[0], "re-pushed automatically") {
		t.Fatalf("failure warning = %v, want failure line with the self-heal note", w)
	}

	a.recordSyncIssue("user:app", nil, errors.New("changed on the board since checkout: README.md (re-run apps_checkout to pick up the board's version)"))
	if w := a.pendingSyncWarnings(); len(w) != 1 || strings.Contains(w[0], "re-pushed automatically") || !strings.Contains(w[0], "re-run apps_checkout") {
		t.Fatalf("conflict warning = %v, want a passthrough of the conflict error only", w)
	}

	// A quiet sync proves nothing about a conflict its mtime gate skipped: the conflict half must stick.
	a.recordSyncIssue("user:app", nil, nil)
	if w := a.pendingSyncWarnings(); len(w) != 1 || !strings.Contains(w[0], "re-run apps_checkout") {
		t.Fatalf("conflict must survive a quiet sync, got %v", w)
	}

	a.recordSyncIssue("user:app", errors.New("write did not persist"), nil)
	if w := a.pendingSyncWarnings(); len(w) != 2 {
		t.Fatalf("failure + sticky conflict = %v, want both lines", w)
	}

	a.clearConflictIssue("user:app")
	a.recordSyncIssue("user:app", nil, nil)
	if w := a.pendingSyncWarnings(); len(w) != 0 {
		t.Fatalf("re-checkout then a clean sync must clear everything, got %v", w)
	}
}

func TestGhostWarningsOncePerEdit(t *testing.T) {
	a := &App{ghostMirrors: map[string]bool{}}
	present := map[string]bool{"g": true}

	a.recordGhostMirrors(present, map[string]bool{"g": true})
	if w := a.dueGhostWarnings(); len(w) != 1 || w[0] != "g" {
		t.Fatalf("first render = %v, want [g]", w)
	}
	if w := a.dueGhostWarnings(); len(w) != 0 {
		t.Fatalf("second render = %v, want silence until a newer edit", w)
	}
	a.recordGhostMirrors(present, map[string]bool{"g": true})
	if w := a.dueGhostWarnings(); len(w) != 1 {
		t.Fatalf("re-armed render = %v, want [g] again", w)
	}
	a.recordGhostMirrors(map[string]bool{}, nil)
	if len(a.ghostMirrors) != 0 {
		t.Fatal("a vanished dir must drop its entry")
	}
}

// GetFileContent hands images back as data URIs for the editor, so the mirror's reads must undo exactly that —
// and nothing else — or sync-back's read-back verify hashes the URI against raw bytes and reports a false
// "did not persist" for a write that landed byte-identical on the board.
func TestDecodeImageDataURI(t *testing.T) {
	svg := `<svg xmlns="http://www.w3.org/2000/svg"/>`
	mt := mime.TypeByExtension(".svg")
	uri := "data:" + mt + ";base64," + base64.StdEncoding.EncodeToString([]byte(svg))

	if got, err := decodeImageDataURI("/app/assets/a.svg", uri); err != nil || got != svg {
		t.Errorf("encoded image not decoded to raw bytes: %q (%v)", got, err)
	}
	if got, err := decodeImageDataURI("/app/notes.md", uri); err != nil || got != uri {
		t.Errorf("a text file whose content is a data URI must pass through untouched: %q (%v)", got, err)
	}
	if got, err := decodeImageDataURI("/app/assets/a.svg", svg); err != nil || got != svg {
		t.Errorf("image content without the prefix must pass through untouched: %q (%v)", got, err)
	}
	if _, err := decodeImageDataURI("/app/assets/a.svg", "data:"+mt+";base64,!!!"); err == nil {
		t.Error("corrupt base64 after a matching prefix must fail closed")
	}
}

// deniedDirConn serves an app with one subdirectory the board refuses to list.
type deniedDirConn struct{ remote.RemoteConn }

func (deniedDirConn) Stats(p string) (remote.FileInfo, error) {
	return remote.FileInfo{Name: path.Base(p), IsDir: path.Ext(p) == ""}, nil
}

func (deniedDirConn) List(p string) ([]remote.FileInfo, error) {
	if strings.TrimSuffix(p, "/") == "/apps/demo" {
		return []remote.FileInfo{{Name: "app.yaml"}, {Name: "denied", IsDir: true}}, nil
	}
	return nil, errors.New("ls: cannot open directory: Permission denied: Process exited with status 2")
}

// A walk that lost one subtree still hands back what it read: the error names
// the subtree so the callers that compare against a full listing can refuse,
// while a first checkout mirrors the rest instead of failing outright.
func TestBoardFilesListFilesKeepsThePathsFromAPartialWalk(t *testing.T) {
	sb := board.Noop()
	sb.Conn = deniedDirConn{}

	files, err := boardFiles{app: &App{selectedBoard: sb}}.ListFiles("/apps/demo")

	var partial *fs.UnreadableDirsError
	if !errors.As(err, &partial) {
		t.Fatalf("want *fs.UnreadableDirsError, got %v", err)
	}
	if len(partial.Paths) != 1 || partial.Paths[0] != "denied" {
		t.Errorf("want the unreadable dir named, got %v", partial.Paths)
	}
	if len(files) != 1 || files[0] != "/apps/demo/app.yaml" {
		t.Errorf("want the readable files back, got %v", files)
	}
}
