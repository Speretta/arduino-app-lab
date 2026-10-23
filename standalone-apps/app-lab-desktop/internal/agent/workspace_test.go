package agent

import (
	"strings"
	"testing"
)

// The paragraph is the whole feature: without it a scoped session behaves like a general one, and the best-effort name must degrade to the id, never to empty quotes.
func TestWorkspaceFocus(t *testing.T) {
	if got := workspaceFocus(SessionWorkspace{}); got != "" {
		t.Errorf("the general workspace added a paragraph: %q", got)
	}

	named := workspaceFocus(SessionWorkspace{AppID: "dXNlcjpibGluaw", Name: "Blink"})
	// The paragraph no longer names apps_create/apps_clone (the permission layer stops cross-app actions now); it must still say a new app lands beside this one and the session doesn't follow.
	for _, want := range []string{"Blink", "dXNlcjpibGluaw", "apps_checkout", "never inside it", "stays on"} {
		if !strings.Contains(named, want) {
			t.Errorf("scoped paragraph is missing %q: %s", want, named)
		}
	}

	unnamed := workspaceFocus(SessionWorkspace{AppID: "dXNlcjpibGluaw"})
	if strings.Contains(unnamed, `""`) {
		t.Errorf("an unresolved name left empty quotes: %s", unnamed)
	}
	if !strings.Contains(unnamed, "dXNlcjpibGluaw") {
		t.Errorf("an unresolved name dropped the id too: %s", unnamed)
	}
}
