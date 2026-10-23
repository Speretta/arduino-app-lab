package agent

import (
	"sync"
	"testing"
	"time"
)

func permissionFor(sid SessionID, title string) PermissionRequest {
	return PermissionRequest{
		SessionID: sid,
		ToolCall:  &ToolCall{Title: title, Kind: "other"},
		Options: []PermissionOption{
			{ID: "allow_always", Kind: "allow_always"},
			{ID: "allow", Kind: "allow_once"},
			{ID: "reject", Kind: "reject_once"},
		},
	}
}

// Auto-approval happens without the user, so what may be granted — and to whom — is the security-relevant part.
func TestToolGrants(t *testing.T) {
	const startApp = "mcp__arduino-board__apps_start"

	t.Run("an always-allow answers the next identical call", func(t *testing.T) {
		var g toolGrants
		g.record("app-x", permissionFor("s1", startApp), "allow_always")
		opt, ok := g.autoAllow("app-x", permissionFor("s1", startApp))
		if !ok {
			t.Fatal("the second call still prompts")
		}
		if opt != "allow" { // the one-off allow: replying "always" again re-persists a rule the engine can't read back
			t.Errorf("answered with %q, want the one-off allow", opt)
		}
	})

	t.Run("a one-off allow grants nothing", func(t *testing.T) {
		var g toolGrants
		g.record("app-x", permissionFor("s1", startApp), "allow")
		if _, ok := g.autoAllow("app-x", permissionFor("s1", startApp)); ok {
			t.Error("a single Allow was taken as a standing grant")
		}
	})

	t.Run("a reject grants nothing", func(t *testing.T) {
		var g toolGrants
		g.record("app-x", permissionFor("s1", startApp), "reject")
		if _, ok := g.autoAllow("app-x", permissionFor("s1", startApp)); ok {
			t.Error("a Reject was taken as a grant")
		}
	})

	// toPermissionRequest already strips board_exec's always options, so this stands in for that filter regressing.
	t.Run("board_exec can never be granted", func(t *testing.T) {
		var g toolGrants
		exec := permissionFor("s1", "mcp__arduino-board__board_exec")
		g.record("app-x", exec, "allow_always")
		if _, ok := g.autoAllow("app-x", exec); ok {
			t.Error("arbitrary board shell was auto-approved")
		}
	})

	t.Run("a grant does not leak into another workspace", func(t *testing.T) {
		var g toolGrants
		g.record("app-x", permissionFor("s1", startApp), "allow_always")
		if _, ok := g.autoAllow("app-y", permissionFor("s2", startApp)); ok {
			t.Error("another app inherited the grant")
		}
	})

	t.Run("a grant does not cover a different tool", func(t *testing.T) {
		var g toolGrants
		g.record("app-x", permissionFor("s1", startApp), "allow_always")
		if _, ok := g.autoAllow("app-x", permissionFor("s1", "mcp__arduino-board__apps_delete")); ok {
			t.Error("the grant widened to another tool")
		}
	})
}

// fakeGrantStore stands in for the file App Lab keeps, recording what the registry asks it to persist.
type fakeGrantStore struct {
	loaded map[string][]string
	saved  map[string][]string
	loads  int
	rev    uint64
	onLoad func() // runs while the file is being read, to stand in for a grant landing at the same moment
	onSave func() // runs while the file is being written, to stand in for a slow disk
	mu     sync.Mutex
}

func (f *fakeGrantStore) Revision() uint64 { return f.rev }

func (f *fakeGrantStore) LoadGrants() map[string][]string {
	f.mu.Lock()
	f.loads++
	run := f.onLoad
	f.onLoad = nil
	f.mu.Unlock()
	// Outside the lock: the hook records a grant, which locks the store again.
	if run != nil {
		run()
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.loaded
}
func (f *fakeGrantStore) SaveGrants(ws string, keys []string) {
	f.mu.Lock()
	run := f.onSave
	f.onSave = nil
	f.mu.Unlock()
	if run != nil {
		run()
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.saved == nil {
		f.saved = map[string][]string{}
	}
	f.saved[ws] = keys
}

// A grant outlives the chat that gave it, so the file is the whole feature: losing it re-prompts, and reading another workspace's entry auto-approves what the user never saw.
func TestToolGrantsPersist(t *testing.T) {
	const startApp = "mcp__arduino-board__apps_start"

	t.Run("a grant is written under its own workspace", func(t *testing.T) {
		store := &fakeGrantStore{}
		var g toolGrants
		g.attach(store)
		g.record("app-x", permissionFor("s1", startApp), "allow_always")

		if got := store.saved["app-x"]; len(got) != 1 {
			t.Fatalf("workspace entry not saved: %+v", store.saved)
		}
		if _, other := store.saved["app-y"]; other {
			t.Error("saving one workspace touched another")
		}
	})

	t.Run("a grant from an earlier run answers without prompting", func(t *testing.T) {
		key, _ := grantKey(permissionFor("s1", startApp).ToolCall)
		var g toolGrants
		g.attach(&fakeGrantStore{loaded: map[string][]string{"app-x": {key}}})

		if _, ok := g.autoAllow("app-x", permissionFor("s-new", startApp)); !ok {
			t.Error("a session opened after a restart prompted again")
		}
		if _, ok := g.autoAllow("app-y", permissionFor("s-new", startApp)); ok {
			t.Error("another workspace inherited the persisted grant")
		}
	})

	t.Run("board_exec stays unpersistable even if the file claims it", func(t *testing.T) {
		exec := permissionFor("s1", "mcp__arduino-board__board_exec")
		var g toolGrants
		g.attach(&fakeGrantStore{loaded: map[string][]string{"app-x": {exec.ToolCall.Kind + "\x00" + exec.ToolCall.Title}}})

		if _, ok := g.autoAllow("app-x", exec); ok {
			t.Error("a tampered or stale file auto-approved arbitrary board shell")
		}
	})
}

// attach runs inside the agent start, which holds the lock the store needs: reading there deadlocked the start, so the read waits for the first permission and happens once.
func TestToolGrantsLoadsLazily(t *testing.T) {
	store := &fakeGrantStore{loaded: map[string][]string{}}
	var g toolGrants
	g.attach(store)

	if store.loads != 0 {
		t.Fatalf("attach read the store during the agent start (%d reads)", store.loads)
	}

	// Answers come from memory; only the store saying it changed underneath — a rename or a delete — costs a read.
	g.autoAllow("app-x", permissionFor("s1", "mcp__arduino-board__apps_start"))
	g.autoAllow("app-x", permissionFor("s2", "mcp__arduino-board__apps_stop"))
	if store.loads != 1 {
		t.Errorf("the file should be read once on first use, got %d reads", store.loads)
	}

	store.rev++
	g.autoAllow("app-x", permissionFor("s3", "mcp__arduino-board__apps_start"))
	if store.loads != 2 {
		t.Errorf("a rewrite by App Lab was not picked up, got %d reads", store.loads)
	}
}

// The file is merged into what is already there, not swapped in: a grant given before the first read would otherwise be dropped.
func TestToolGrantsMergesTheStoredFile(t *testing.T) {
	const startApp = "mcp__arduino-board__apps_start"
	const cloneApp = "mcp__arduino-board__apps_clone"
	storedKey, _ := grantKey(permissionFor("s1", cloneApp).ToolCall)

	var g toolGrants
	g.attach(&fakeGrantStore{loaded: map[string][]string{"app-x": {storedKey}}})
	g.record("app-x", permissionFor("s1", startApp), "allow_always")

	if _, ok := g.autoAllow("app-x", permissionFor("s2", startApp)); !ok {
		t.Error("the grant given in this run was lost when the file was read")
	}
	if _, ok := g.autoAllow("app-x", permissionFor("s2", cloneApp)); !ok {
		t.Error("the grant from the file was lost")
	}
}

// The workspace alone is too coarse: within one the agent still reaches other apps, and a grant given on a call that stayed home must not answer for one that did not.
func TestGrantsAreScopedToWhatTheCallActsOn(t *testing.T) {
	perm := func(tc *ToolCall) PermissionRequest {
		p := permissionFor("s1", tc.Title)
		p.ToolCall = tc
		return p
	}
	edit := func(path string, outside bool) *ToolCall {
		return &ToolCall{Title: "Edit " + path, Kind: "edit", OutsideWorkspace: outside}
	}
	appTool := func(id string) *ToolCall {
		return &ToolCall{Title: "mcp__arduino-board__apps_start", Kind: "execute", Input: map[string]any{"id": id}}
	}

	t.Run("an inside grant does not cover a call that left the workspace", func(t *testing.T) {
		var g toolGrants
		g.record("app-x", perm(edit("mine/main.py", false)), "allow_always")
		if _, ok := g.autoAllow("app-x", perm(edit("theirs/main.py", true))); ok {
			t.Error("editing another app was auto-approved by a grant given on this one")
		}
	})

	t.Run("an app tool is granted for the app it names, not for the next one", func(t *testing.T) {
		var g toolGrants
		g.record("app-x", perm(appTool("dXNlcjo0")), "allow_always")
		if _, ok := g.autoAllow("app-x", perm(appTool("dXNlcjo5"))); ok {
			t.Error("starting one app auto-approved starting another")
		}
		if _, ok := g.autoAllow("app-x", perm(appTool("dXNlcjo0"))); !ok {
			t.Error("the same app still prompts")
		}
	})

	t.Run("an outside grant answers the same outside call again", func(t *testing.T) {
		var g toolGrants
		g.record("app-x", perm(edit("theirs/main.py", true)), "allow_always")
		if _, ok := g.autoAllow("app-x", perm(edit("theirs/main.py", true))); !ok {
			t.Error("Always allow on a disclosed outside call did nothing")
		}
	})
}

// The engine's own always-rule is per tool for a whole session, so the user's "Always allow" must never reach it — one approved Edit would cover any other app.
func TestAlwaysAllowIsNotForwardedToTheEngine(t *testing.T) {
	req := permissionFor("s1", "Edit mine/main.py")

	if got := engineAnswer(req, "allow_always"); got != "allow" {
		t.Errorf("the engine was told %q, want the one-off allow", got)
	}
	if got := engineAnswer(req, "allow"); got != "allow" {
		t.Errorf("a one-off allow was rewritten to %q", got)
	}
	if got := engineAnswer(req, "reject"); got != "reject" {
		t.Errorf("a reject was rewritten to %q", got)
	}
}

// Deleting an app drops its grants, and ids are reusable: a running agent keeping its copy would auto-approve the next app of that name.
func TestARevokedGrantStopsAnsweringWithoutARestart(t *testing.T) {
	store := &fakeGrantStore{loaded: map[string][]string{}}
	var g toolGrants
	g.attach(store)
	g.record("app-gone", permissionFor("s1", "mcp__arduino-board__apps_start"), "allow_always")
	if _, ok := g.autoAllow("app-gone", permissionFor("s2", "mcp__arduino-board__apps_start")); !ok {
		t.Fatal("the grant never took")
	}

	store.loaded = map[string][]string{} // App Lab dropped the deleted app's grants behind the agent's back
	store.rev++

	if _, ok := g.autoAllow("app-gone", permissionFor("s3", "mcp__arduino-board__apps_start")); ok {
		t.Error("a revoked grant still auto-approved: a later app reusing the id inherits it")
	}
}

// A request offering no one-off allow must not be auto-approved into the engine's "always" option: the user gets the prompt instead.
func TestNoOneOffAllowMeansNoAutoApproval(t *testing.T) {
	const tool = "mcp__arduino-board__apps_start"
	onlyAlways := PermissionRequest{
		SessionID: "s1",
		ToolCall:  &ToolCall{Title: tool, Kind: "other"},
		Options: []PermissionOption{
			{ID: "allow_always", Kind: "allow_always"},
			{ID: "reject", Kind: "reject_once"},
		},
	}

	if _, ok := allowOptionID(onlyAlways.Options); ok {
		t.Error("the persistent option was offered as if it were a one-off")
	}
	var g toolGrants
	g.record("app-x", onlyAlways, "allow_always")
	if _, ok := g.autoAllow("app-x", onlyAlways); ok {
		t.Error("auto-approval answered with the engine's session-wide option")
	}
}

// Two calls that both left the workspace are not the same call: allowing one file must not answer for another, even when the titles match.
func TestOutsideGrantsAreScopedToWhereTheyLand(t *testing.T) {
	perm := func(path string) PermissionRequest {
		p := permissionFor("s1", "Edit")
		p.ToolCall = &ToolCall{Title: "Edit", Kind: "edit", Paths: []string{path}, OutsideWorkspace: true}
		return p
	}
	var g toolGrants
	g.record("app-x", perm("/mirror/app-b/main.py"), "allow_always")

	if _, ok := g.autoAllow("app-x", perm("/mirror/app-c/main.py")); ok {
		t.Error("an edit in one app auto-approved an edit in another")
	}
	if _, ok := g.autoAllow("app-x", perm("/mirror/app-b/main.py")); !ok {
		t.Error("the same file prompts again")
	}
}

// A grant recorded while a reload was reading isn't in that snapshot: replacing the map would lose the answer the user just gave.
func TestAReloadDoesNotDropAGrantRecordedMeanwhile(t *testing.T) {
	store := &fakeGrantStore{loaded: map[string][]string{}}
	var g toolGrants
	g.attach(store)
	g.autoAllow("app-x", permissionFor("s1", "mcp__arduino-board__apps_start")) // first read, map now loaded

	store.onLoad = func() { g.record("app-x", permissionFor("s2", "mcp__arduino-board__apps_stop"), "allow_always") }
	store.rev++
	g.autoAllow("app-x", permissionFor("s3", "mcp__arduino-board__apps_start"))

	if _, ok := g.autoAllow("app-x", permissionFor("s4", "mcp__arduino-board__apps_stop")); !ok {
		t.Error("the grant recorded during the reload was wiped by the file snapshot")
	}
}

// Two answers can be in flight at once — a background turn and the open one each waiting on a permission — and
// SaveGrants replaces the workspace's whole list, so an older snapshot landing last silently drops the newer grant.
func TestConcurrentGrantsBothSurvive(t *testing.T) {
	store := &fakeGrantStore{onSave: func() { time.Sleep(30 * time.Millisecond) }}
	var g toolGrants
	g.attach(store)

	var wg sync.WaitGroup
	for _, title := range []string{"mcp__arduino-board__apps_start", "mcp__arduino-board__apps_stop"} {
		wg.Add(1)
		go func(title string) {
			defer wg.Done()
			g.record("ws", permissionFor("s1", title), "allow_always")
		}(title)
	}
	wg.Wait()

	store.mu.Lock()
	defer store.mu.Unlock()
	if got := len(store.saved["ws"]); got != 2 {
		t.Errorf("the file kept %d of the 2 grants: %q", got, store.saved["ws"])
	}
}
