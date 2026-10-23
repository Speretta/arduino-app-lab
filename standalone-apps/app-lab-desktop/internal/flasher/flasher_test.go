package flasher

import (
	"errors"
	"runtime"
	"testing"
	"time"

	"github.com/arduino/go-paths-helper"
)

// stubDaemon replaces startDaemon with start for the test, and clears the recorded daemon before and after.
func stubDaemon(t *testing.T, start func() (*Flasher, error)) {
	t.Helper()
	original := startDaemon
	reset := func() {
		startedMu.Lock()
		started = nil
		startedMu.Unlock()
		flasherInstance = nil
	}
	reset()
	startDaemon = start
	t.Cleanup(func() {
		startDaemon = original
		reset()
	})
}

// fakeDaemon is a Flasher whose process is a sleep that the test can watch for exit.
func fakeDaemon(t *testing.T) (*Flasher, <-chan struct{}) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("uses sleep(1)")
	}
	proc, err := paths.NewProcess(nil, "sleep", "30")
	if err != nil {
		t.Fatal(err)
	}
	if err := proc.Start(); err != nil {
		t.Fatal(err)
	}
	exited := make(chan struct{})
	go func() {
		_ = proc.Wait()
		close(exited)
	}()
	t.Cleanup(func() { _ = proc.Kill() })
	return &Flasher{Process: proc}, exited
}

func assertExits(t *testing.T, exited <-chan struct{}, what string) {
	t.Helper()
	select {
	case <-exited:
	case <-time.After(5 * time.Second):
		t.Fatalf("%s is still running", what)
	}
}

func assertRunning(t *testing.T, exited <-chan struct{}, what string) {
	t.Helper()
	select {
	case <-exited:
		t.Fatalf("%s was stopped", what)
	case <-time.After(100 * time.Millisecond):
	}
}

func TestShutdownDaemonNeverStartsOne(t *testing.T) {
	starts := 0
	stubDaemon(t, func() (*Flasher, error) {
		starts++
		return nil, errors.New("must not be started")
	})

	ShutdownDaemon()

	if starts != 0 {
		t.Errorf("ShutdownDaemon started the daemon %d time(s)", starts)
	}
}

func TestShutdownDaemonStopsTheStartedOne(t *testing.T) {
	daemon, exited := fakeDaemon(t)
	stubDaemon(t, func() (*Flasher, error) { return daemon, nil })
	if _, err := FlashDaemonService(); err != nil {
		t.Fatal(err)
	}

	ShutdownDaemon()

	assertExits(t, exited, "the daemon")
	startedMu.Lock()
	defer startedMu.Unlock()
	if started != nil {
		t.Error("the stopped daemon is still recorded as started")
	}
}

func TestFlashDaemonServiceRetriesAFailedStart(t *testing.T) {
	daemon, exited := fakeDaemon(t)
	starts := 0
	stubDaemon(t, func() (*Flasher, error) {
		starts++
		if starts == 1 {
			return nil, errors.New("no space left on device")
		}
		return daemon, nil
	})

	if _, err := FlashDaemonService(); err == nil {
		t.Fatal("no error from the failed start")
	}
	got, err := FlashDaemonService()
	if err != nil {
		t.Fatalf("the failed start was not retried: %v", err)
	}
	if got != daemon {
		t.Fatal("the retry returned a different daemon")
	}
	if again, err := FlashDaemonService(); err != nil || again != daemon {
		t.Errorf("third call: %v, %v", again, err)
	}
	if starts != 2 {
		t.Errorf("%d starts, want 2: a running daemon must be reused", starts)
	}
	assertRunning(t, exited, "the daemon")
}

func TestCancelFlashThenShutdownStopsTheNewDaemon(t *testing.T) {
	first, firstExited := fakeDaemon(t)
	second, secondExited := fakeDaemon(t)
	daemons := []*Flasher{first, second}
	stubDaemon(t, func() (*Flasher, error) {
		if len(daemons) == 0 {
			return nil, errors.New("a third daemon was started")
		}
		d := daemons[0]
		daemons = daemons[1:]
		return d, nil
	})

	// What Flash does before it streams.
	d, err := FlashDaemonService()
	if err != nil {
		t.Fatal(err)
	}
	flasherInstance = d

	CancelFlash()
	assertExits(t, firstExited, "the cancelled daemon")

	next, err := FlashDaemonService()
	if err != nil {
		t.Fatal(err)
	}
	if next != second {
		t.Fatal("no new daemon after CancelFlash")
	}

	ShutdownDaemon()
	assertExits(t, secondExited, "the new daemon")
}
