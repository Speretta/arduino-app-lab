//go:build !windows

// Package instance keeps a second App Lab from running beside the first one
// for the same user. Two instances share one WebKit data directory, and WebKit
// creates a fresh IndexedDB database without a transaction, so a second
// instance can read it half-built and fail to open storage.
package instance

import (
	"errors"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	"golang.org/x/sys/unix"
)

// held keeps the lock file open for the life of the process. An unreferenced
// *os.File is closed by its finalizer, and closing it releases the lock.
var held *os.File

// claim takes an exclusive flock on path. It returns the locked file and true
// when this process should start, or nil and false when it should exit.
//
// When another process holds the lock, forward sends this launch's arguments to
// it. If forward fails, claim waits up to wait for the lock, polling every poll:
// the other process may be closing, and the kernel releases the lock only when
// it exits. Each poll also retries forward, because a process that is starting
// holds the lock before Wails registers the D-Bus name that forward calls.
func claim(path string, forward func() error, wait, poll time.Duration) (*os.File, bool) {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		slog.Warn("instance lock unavailable; starting without it", "path", path, "err", err)
		return nil, true
	}
	f, err := os.OpenFile(path, os.O_RDWR|os.O_CREATE, 0o600)
	if err != nil {
		slog.Warn("instance lock unavailable; starting without it", "path", path, "err", err)
		return nil, true
	}

	busy, err := tryLock(f)
	if err != nil {
		f.Close()
		slog.Warn("instance lock unavailable; starting without it", "path", path, "err", err)
		return nil, true
	}
	if !busy {
		return f, true
	}

	forwardErr := forward()
	if forwardErr == nil {
		f.Close()
		slog.Info("App Lab is already running; launch arguments sent to it")
		return nil, false
	}
	slog.Warn("App Lab is already running and the forward failed; retrying until it answers or exits",
		"err", forwardErr, "wait", wait)

	deadline := time.Now().Add(wait)
	for time.Now().Before(deadline) {
		time.Sleep(poll)
		busy, err := tryLock(f)
		if err != nil {
			f.Close()
			slog.Warn("instance lock unavailable; starting without it", "path", path, "err", err)
			return nil, true
		}
		if !busy {
			slog.Info("the other App Lab exited; starting")
			return f, true
		}
		if forwardErr = forward(); forwardErr == nil {
			f.Close()
			slog.Info("App Lab is already running; launch arguments sent to it on a retry")
			return nil, false
		}
	}
	f.Close()
	slog.Warn("the other App Lab is still running and did not answer; exiting",
		"wait", wait, "err", forwardErr)
	return nil, false
}

// tryLock reports whether another open file description holds the lock.
func tryLock(f *os.File) (busy bool, err error) {
	err = unix.Flock(int(f.Fd()), unix.LOCK_EX|unix.LOCK_NB)
	if errors.Is(err, unix.EWOULDBLOCK) {
		return true, nil
	}
	return false, err
}
