// Package boardsession retries board commands that the SSH server refused to
// start.
//
// The SSH transport dials the board once and opens a session channel on that
// connection for every command. sshd allows MaxSessions channels at a time (10
// on the board); one over the limit is refused with
// "ssh: rejected: connect failed (open failed)". Callers that fire several
// commands at once, like the settings page, hit the limit at random.
package boardsession

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"time"

	"github.com/arduino/arduino-app-cli/pkg/board/remote"
	"golang.org/x/crypto/ssh"
)

// Backoff is short because the contention it waits out is another command
// finishing, not the board being busy.
var Backoff = []time.Duration{30 * time.Millisecond, 90 * time.Millisecond}

// Wrap returns conn with GetCmd(...).Run, GetCmd(...).Output and ReadFile
// retried while the SSH server refuses the session channel.
//
// List and Stats are left alone because internal/fs already retries them.
// Writes, Interactive, Forward and Push pass through unchanged.
func Wrap(conn remote.RemoteConn) remote.RemoteConn {
	return &retryingConn{RemoteConn: conn}
}

type retryingConn struct {
	remote.RemoteConn
}

func (c *retryingConn) ReadFile(path string) (io.ReadCloser, error) {
	var r io.ReadCloser
	err := retry(context.Background(), "read "+path, func() error {
		var err error
		r, err = c.RemoteConn.ReadFile(path)
		return err
	})
	return r, err
}

// GetCmd defers opening the session to Run, Output or Interactive, so that each
// retry can open a new one.
func (c *retryingConn) GetCmd(cmd string, args ...string) remote.Cmder {
	return &retryingCmd{conn: c.RemoteConn, cmd: cmd, args: args}
}

type retryingCmd struct {
	conn remote.RemoteConn
	cmd  string
	args []string
}

func (c *retryingCmd) Run(ctx context.Context) error {
	return retry(ctx, c.cmd, func() error {
		return c.conn.GetCmd(c.cmd, c.args...).Run(ctx)
	})
}

func (c *retryingCmd) Output(ctx context.Context) ([]byte, error) {
	var out []byte
	err := retry(ctx, c.cmd, func() error {
		var err error
		out, err = c.conn.GetCmd(c.cmd, c.args...).Output(ctx)
		return err
	})
	return out, err
}

func (c *retryingCmd) Interactive() (io.WriteCloser, io.Reader, io.Reader, remote.Closer, error) {
	return c.conn.GetCmd(c.cmd, c.args...).Interactive()
}

func retry(ctx context.Context, name string, op func() error) error {
	attempts := len(Backoff) + 1
	var err error
	for attempt := range attempts {
		if attempt > 0 {
			select {
			case <-time.After(Backoff[attempt-1]):
			case <-ctx.Done():
				return err
			}
		}
		err = op()
		if !channelRefused(err) {
			return err
		}
		slog.Warn("board session refused",
			"op", name, "attempt", attempt+1, "attempts", attempts, "error", err)
	}
	return err
}

// channelRefused reports whether the SSH server refused to open the session
// channel. The command never started in that case, so running it again is safe
// even when it changes the board. EOF or a reset connection must not count: they
// can arrive after the command ran, and a second `reboot` or `nmcli connect`
// is not safe.
func channelRefused(err error) bool {
	var openErr *ssh.OpenChannelError
	return errors.As(err, &openErr)
}
