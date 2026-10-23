package watcher

import "testing"

// A folder op holds only the folder. The files it copies or deletes must be
// dropped too, or a renamed folder's open files reload over unsaved edits.
func TestHeldFolderSuppressesItsDescendants(t *testing.T) {
	m := NewWatchManager(nil)
	m.SuppressHold("/apps/a/pkg")

	for _, p := range []string{"/apps/a/pkg", "/apps/a/pkg/mod.py", "/apps/a/pkg/sub/x.py"} {
		if !m.suppressedLocked(p) {
			t.Errorf("%s: want suppressed while its folder is held", p)
		}
	}
	for _, p := range []string{"/apps/a", "/apps/a/pkg2/mod.py", "/apps/a/other.py"} {
		if m.suppressedLocked(p) {
			t.Errorf("%s: want reported, it is not under the held folder", p)
		}
	}
}

func TestReleasedFolderKeepsItsDescendantsInTheGraceWindow(t *testing.T) {
	m := NewWatchManager(nil)
	m.SuppressHold("/apps/a/pkg")
	m.SuppressRelease("/apps/a/pkg")

	if !m.suppressedLocked("/apps/a/pkg/mod.py") {
		t.Error("want a trailing event under the released folder suppressed")
	}
	if m.suppressedLocked("/apps/a/other.py") {
		t.Error("want a sibling of the released folder reported")
	}
}
