package fs

import (
	"errors"
	"io/fs"
	"os"
	"sync/atomic"
	"testing"
	"time"
)

const testApp = "./testdata/my_app"

// failingFS fails Open for one path a fixed number of times (-1 for always) and
// counts the attempts, standing in for a board refusing a shell session while
// its SSH MaxSessions is exhausted.
type failingFS struct {
	inner    fs.FS
	target   string
	failures int32 // remaining failures; -1 means always
	err      error
	opens    atomic.Int32
}

var errRefused = errors.New("ssh: rejected: connect failed (open failed)")

// What a command that ran and failed looks like: ssh reports the remote exit
// status, and no number of retries changes it.
var errExited = errors.New("Process exited with status 2")

func (f *failingFS) Open(name string) (fs.File, error) {
	if name == f.target {
		f.opens.Add(1)
		if f.failures < 0 || f.opens.Load() <= f.failures {
			return nil, f.err
		}
	}
	return f.inner.Open(name)
}

func newFailingFS(target string, failures int32) *failingFS {
	return &failingFS{inner: os.DirFS(testApp), target: target, failures: failures, err: errRefused}
}

// The transient case, which is what happens on the board: one refused session,
// retried, and the listing comes back whole with no error at all.
func TestListDirEntriesRetriesATransientFailure(t *testing.T) {
	fsys := newFailingFS("python", 1)

	entries, err := listDirEntries(fsys, "python")
	if err != nil {
		t.Fatalf("a listing that fails once should be retried, got %v", err)
	}
	if len(entries) != 2 {
		t.Errorf("want python/ fully listed (2 entries), got %d", len(entries))
	}
	if fsys.opens.Load() != 2 {
		t.Errorf("want 2 opens (one failure, one success), got %d", fsys.opens.Load())
	}
}

// Only a refused session is worth another round trip. A missing directory or a
// permission denial comes back as a remote exit status, and retrying it spends
// three sessions plus backoff to arrive at the same answer.
func TestListDirEntriesDoesNotRetryACommandThatRanAndFailed(t *testing.T) {
	fsys := newFailingFS("python", -1)
	fsys.err = errExited

	if _, err := listDirEntries(fsys, "python"); !errors.Is(err, errExited) {
		t.Fatalf("want the command's own error, got %v", err)
	}
	if got := fsys.opens.Load(); got != 1 {
		t.Errorf("want a single attempt, got %d", got)
	}
}

func TestListDirEntriesBoundsItsAttempts(t *testing.T) {
	fsys := newFailingFS("python", -1)

	if _, err := listDirEntries(fsys, "python"); err == nil {
		t.Fatal("want an error")
	}

	want := int32(len(boardReadBackoff) + 1)
	if got := fsys.opens.Load(); got != want {
		t.Errorf("want %d attempts, got %d", want, got)
	}
}

// The limiter is released between attempts, so a retry waits out contention
// without sitting on a slot another listing could use. Squeeze the limiter to
// one slot and check a second listing gets through while the first is backing
// off — if the slot were held across the backoff, it could not.
func TestListDirEntriesReleasesTheLimiterBetweenAttempts(t *testing.T) {
	original := boardReads
	boardReads = make(chan struct{}, 1)
	defer func() { boardReads = original }()

	finished := make(chan string, 2)

	go func() {
		listDirEntries(newFailingFS("python", -1), "python") //nolint:errcheck // the failure is the point
		finished <- "retrying"
	}()

	// Let the first attempt fail and enter its backoff, so the contended slot is
	// the one released between attempts rather than one never taken.
	time.Sleep(10 * time.Millisecond)

	go func() {
		if _, err := listDirEntries(os.DirFS(testApp), "sketch"); err != nil {
			t.Errorf("second listing failed: %v", err)
		}
		finished <- "other"
	}()

	if first := <-finished; first != "other" {
		t.Errorf("the retrying listing held the limiter across its backoff (%q finished first)", first)
	}
	<-finished
}

// The error names every unreadable path, because that string is what reaches the
// log and the mirror's failure message.
func TestUnreadableDirsErrorNamesEveryPath(t *testing.T) {
	err := &UnreadableDirsError{Paths: []string{"python", "assets/libs"}}

	if got := err.Error(); got != "could not list: python, assets/libs" {
		t.Errorf("unexpected message: %q", got)
	}
}

// The walk's fs.FS branch refuses a file too, so neither listing primitive can
// answer "empty directory" for something that is not a directory.
func TestListDirEntriesRefusesAFilePath(t *testing.T) {
	if _, err := listDirEntries(os.DirFS(testApp), "app.yaml"); err == nil {
		t.Error("want an error for a path that is a file, got a listing")
	}
}
