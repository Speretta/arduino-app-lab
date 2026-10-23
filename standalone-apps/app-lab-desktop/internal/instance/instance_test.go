//go:build !windows

package instance

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"golang.org/x/sys/unix"
)

// hold takes the lock through a second open file description, as another
// process would. flock conflicts between descriptions in one process too.
func hold(t *testing.T, path string) *os.File {
	t.Helper()
	f, err := os.OpenFile(path, os.O_RDWR|os.O_CREATE, 0o600)
	require.NoError(t, err)
	require.NoError(t, unix.Flock(int(f.Fd()), unix.LOCK_EX|unix.LOCK_NB))
	t.Cleanup(func() { f.Close() })
	return f
}

func noForward() error { return errors.New("no running instance answered") }

func TestClaimFreeLock(t *testing.T) {
	path := filepath.Join(t.TempDir(), "app.lock")
	forwarded := false

	f, run := claim(path, func() error { forwarded = true; return nil }, time.Second, 10*time.Millisecond)

	require.True(t, run)
	require.NotNil(t, f)
	require.False(t, forwarded)
	defer f.Close()

	// The lock is really held: another description cannot take it.
	other, err := os.OpenFile(path, os.O_RDWR, 0)
	require.NoError(t, err)
	defer other.Close()
	busy, err := tryLock(other)
	require.NoError(t, err)
	require.True(t, busy)
}

func TestClaimHeldForwardSucceeds(t *testing.T) {
	path := filepath.Join(t.TempDir(), "app.lock")
	hold(t, path)
	forwarded := 0

	f, run := claim(path, func() error { forwarded++; return nil }, time.Second, 10*time.Millisecond)

	require.False(t, run)
	require.Nil(t, f)
	require.Equal(t, 1, forwarded)
}

func TestClaimHeldForwardFailsThenReleased(t *testing.T) {
	path := filepath.Join(t.TempDir(), "app.lock")
	holder := hold(t, path)
	go func() {
		time.Sleep(300 * time.Millisecond)
		holder.Close()
	}()

	start := time.Now()
	f, run := claim(path, noForward, 10*time.Second, 100*time.Millisecond)

	require.True(t, run)
	require.NotNil(t, f)
	defer f.Close()
	require.GreaterOrEqual(t, time.Since(start), 300*time.Millisecond)
	require.Less(t, time.Since(start), 2*time.Second)
}

// The running instance holds the lock before its D-Bus name exists, so the
// first forwards fail and a later one reaches it.
func TestClaimHeldForwardSucceedsOnRetry(t *testing.T) {
	path := filepath.Join(t.TempDir(), "app.lock")
	hold(t, path)
	calls := 0
	forward := func() error {
		calls++
		if calls < 4 {
			return errors.New("name not registered yet")
		}
		return nil
	}

	start := time.Now()
	f, run := claim(path, forward, 10*time.Second, 50*time.Millisecond)

	require.False(t, run)
	require.Nil(t, f)
	require.Equal(t, 4, calls)
	require.GreaterOrEqual(t, time.Since(start), 150*time.Millisecond)
	require.Less(t, time.Since(start), 2*time.Second)
}

func TestClaimHeldLongerThanWait(t *testing.T) {
	path := filepath.Join(t.TempDir(), "app.lock")
	hold(t, path)

	start := time.Now()
	f, run := claim(path, noForward, 300*time.Millisecond, 50*time.Millisecond)

	require.False(t, run)
	require.Nil(t, f)
	require.GreaterOrEqual(t, time.Since(start), 300*time.Millisecond)
}

func TestClaimLockCannotBeOpened(t *testing.T) {
	dir := t.TempDir()
	require.NoError(t, os.Chmod(dir, 0o500))
	t.Cleanup(func() { os.Chmod(dir, 0o700) })
	if os.Geteuid() == 0 {
		t.Skip("root ignores the directory mode")
	}

	f, run := claim(filepath.Join(dir, "sub", "app.lock"), noForward, time.Second, 10*time.Millisecond)

	require.True(t, run)
	require.Nil(t, f)
}
