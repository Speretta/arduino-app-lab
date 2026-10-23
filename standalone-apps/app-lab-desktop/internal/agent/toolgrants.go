package agent

import (
	"log/slog"
	"sort"
	"strings"
	"sync"
)

// GrantStore persists the user's "Always allow" answers between runs; App Lab owns the file and hands over one workspace at a time.
type GrantStore interface {
	LoadGrants() map[string][]string
	SaveGrants(workspaceID string, keys []string)
	// Revision changes when the owner rewrites the file — an app renamed or deleted — so the agent notices without re-reading.
	Revision() uint64
}

// toolGrants remembers the user's "Always allow" choices per WORKSPACE, because the engine cannot remember them at all: its own rule for an MCP tool is written to <cwd>/.claude/settings.local.json, a scope policySettingSources excludes and hardenAgentPolicyDir deletes, so every later call would prompt again. The workspace is the scope the user reasons in — a grant given while working on one app carries to the next chat about that app, and never to another app. Until the revoke UI exists, uninstalling or clearing App Lab's agent config is the only way back.
type toolGrants struct {
	// Held across snapshot-then-save so two answers persist in the order they were taken: SaveGrants replaces
	// the workspace's whole list, so an older snapshot landing last would drop the newer grant from the file.
	// Separate from mu, which must never be held while the store touches the filesystem.
	writeMu sync.Mutex
	mu      sync.Mutex
	store   GrantStore
	loaded  bool
	rev     uint64
	writes  uint64                     // grants recorded here, so a reload can tell its file snapshot is already out of date
	allowed map[string]map[string]bool // workspace app id ("" = the general workspace) -> grant keys
}

// attach gives the registry its persistence; it can't read the file yet, since the agent start already holds the lock the store needs.
func (g *toolGrants) attach(store GrantStore) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.store, g.allowed, g.loaded = store, map[string]map[string]bool{}, false
}

// ensureLoaded reads what earlier runs granted, once, on the first permission — long after the start has finished.
func (g *toolGrants) ensureLoaded() {
	g.mu.Lock()
	store, done := g.store, g.loaded
	g.mu.Unlock()
	if done || store == nil {
		return
	}
	g.readStore(store, false) // merged: a grant recorded before this first read must not be lost
	g.mu.Lock()
	g.loaded = true
	g.mu.Unlock()
}

// syncRevision re-reads the file when its owner says it changed: ids are reusable, so a stale copy would hand a deleted app's grants to the next app of that name.
func (g *toolGrants) syncRevision() {
	g.mu.Lock()
	store, seen := g.store, g.rev
	g.mu.Unlock()
	if store == nil {
		return
	}
	rev := store.Revision()
	if rev == seen {
		return
	}
	g.reload()
	g.mu.Lock()
	g.rev = rev
	g.mu.Unlock()
}

// reload takes the file as the truth: merging would keep answering for a deleted app, whose id a later app of the same name gets.
func (g *toolGrants) reload() {
	g.mu.Lock()
	store := g.store
	g.mu.Unlock()
	if store != nil {
		g.readStore(store, true)
	}
}

// readStore reads the file into the map, replacing what is there or merging into it.
func (g *toolGrants) readStore(store GrantStore, replace bool) {
	g.mu.Lock()
	before := g.writes
	g.mu.Unlock()

	saved := store.LoadGrants() // touches the filesystem, so never under the registry's own lock

	g.mu.Lock()
	defer g.mu.Unlock()
	// A grant recorded mid-read isn't in the snapshot: replacing would drop it and re-prompt, so this read merges.
	if replace && g.writes != before {
		replace = false
	}
	if replace || g.allowed == nil {
		g.allowed = map[string]map[string]bool{}
	}
	for ws, keys := range saved {
		if g.allowed[ws] == nil {
			g.allowed[ws] = map[string]bool{}
		}
		for _, k := range keys {
			g.allowed[ws][k] = true
		}
	}
}

// grantKey identifies what was granted; an MCP tool's title is its exact qualified name (mcp__arduino-board__apps_start), while a native tool's also carries its arguments, so there the grant is narrower — never wider. Never-auto-approvable tools have no key at all.
func grantKey(tc *ToolCall) (string, bool) {
	if tc == nil || tc.Title == "" || isNeverAutoApprovable(tc.Title) {
		return "", false
	}
	return tc.Kind + "\x00" + tc.Title + "\x00" + grantScope(tc), true
}

// grantScope stops a grant covering a call that acts elsewhere: an app tool is scoped to the app it names, anything that left the workspace to where it landed.
func grantScope(tc *ToolCall) string {
	if target, ok := toolCallAppID(tc); ok {
		return target
	}
	if tc.OutsideWorkspace {
		// Named by where it lands: a title like "Edit" is too generic, and one file in another app must not answer for a file in a third.
		return "outside\x00" + strings.Join(toolCallPaths(tc), "\x00")
	}
	return ""
}

// record stores the grant when the user answered with an "always allow" option.
func (g *toolGrants) record(workspaceID string, req PermissionRequest, optionID string) {
	key, ok := grantKey(req.ToolCall)
	if !ok || !isAlwaysAllowOption(req.Options, optionID) {
		return
	}
	g.ensureLoaded()
	g.writeMu.Lock()
	defer g.writeMu.Unlock()
	g.mu.Lock()
	if g.allowed == nil {
		g.allowed = map[string]map[string]bool{}
	}
	if g.allowed[workspaceID] == nil {
		g.allowed[workspaceID] = map[string]bool{}
	}
	g.allowed[workspaceID][key] = true
	g.writes++
	store, keys := g.store, sortedKeys(g.allowed[workspaceID])
	g.mu.Unlock()

	// Written outside mu so a concurrent lookup isn't blocked on the filesystem; writeMu keeps the order.
	if store != nil {
		store.SaveGrants(workspaceID, keys)
	}
}

// sortedKeys makes the persisted file stable between runs, so a diff of it means a real change.
func sortedKeys(set map[string]bool) []string {
	keys := make([]string, 0, len(set))
	for k := range set {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// autoAllow reports the option to answer with when an earlier "always allow" in this session already covers the call.
func (g *toolGrants) autoAllow(workspaceID string, req PermissionRequest) (string, bool) {
	key, ok := grantKey(req.ToolCall)
	if !ok {
		return "", false
	}
	g.ensureLoaded()
	g.syncRevision()
	g.mu.Lock()
	granted := g.allowed[workspaceID][key]
	g.mu.Unlock()
	if !granted {
		return "", false
	}
	id, ok := allowOptionID(req.Options)
	if !ok {
		// Deliberately not the persistent option, unlike engineAnswer: there the user just clicked allow, so the
		// widening is theirs; here nobody is present, and a session-wide rule for the tool would be taken in their
		// name. The cost is re-prompting on a shape Claude Code does not currently send — logged so it shows up.
		slog.Warn("[permission] a grant covers this call but the prompt offers no one-off allow; asking the user", "tool", req.ToolCall.Title)
	}
	return id, ok
}

// isAlwaysAllowOption reports whether the chosen option persists the decision *and* allows — a one-off allow, or any reject, grants nothing.
func isAlwaysAllowOption(opts []PermissionOption, optionID string) bool {
	for _, o := range opts {
		if o.ID == optionID {
			return isPersistentGrantOption(o.ID, o.Kind) && isAllowOption(o.ID, o.Kind)
		}
	}
	return false
}

func isAllowOption(id, kind string) bool {
	return strings.HasPrefix(strings.ToLower(kind), "allow") || strings.HasPrefix(strings.ToLower(id), "allow")
}

// allowOptionID finds the one-off allow, never the persistent one: that would hand the engine a session-wide rule for the tool.
func allowOptionID(opts []PermissionOption) (string, bool) {
	for _, o := range opts {
		if isAllowOption(o.ID, o.Kind) && !isPersistentGrantOption(o.ID, o.Kind) {
			return o.ID, true
		}
	}
	return "", false
}
