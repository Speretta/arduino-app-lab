package boardsession

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"
	"testing"

	"github.com/arduino/arduino-app-cli/pkg/board/remote"
	"golang.org/x/crypto/ssh"
)

// What the SSH transport returns from GetCmd when sshd refuses the channel.
var errRefused = fmt.Errorf("failed to create SSH session: %w",
	&ssh.OpenChannelError{Reason: ssh.ConnectionFailed, Message: "open failed"})

// What a command that ran and failed looks like.
var errExited = errors.New("Process exited with status 2")

// fakeConn returns the queued errors in order, then succeeds. It counts every
// session it is asked to open.
type fakeConn struct {
	remote.RemoteConn
	errs     []error
	sessions int
}

func (f *fakeConn) next() error {
	f.sessions++
	if len(f.errs) == 0 {
		return nil
	}
	err := f.errs[0]
	f.errs = f.errs[1:]
	return err
}

func (f *fakeConn) GetCmd(string, ...string) remote.Cmder {
	return fakeCmd{err: f.next()}
}

func (f *fakeConn) ReadFile(string) (io.ReadCloser, error) {
	if err := f.next(); err != nil {
		return nil, err
	}
	return io.NopCloser(strings.NewReader("PRETTY_NAME=Debian")), nil
}

func (f *fakeConn) List(string) ([]remote.FileInfo, error) {
	return nil, f.next()
}

type fakeCmd struct{ err error }

func (c fakeCmd) Run(context.Context) error { return c.err }
func (c fakeCmd) Output(context.Context) ([]byte, error) {
	if c.err != nil {
		return nil, c.err
	}
	return []byte("ok"), nil
}
func (c fakeCmd) Interactive() (io.WriteCloser, io.Reader, io.Reader, remote.Closer, error) {
	return nil, nil, nil, nil, c.err
}

func TestOutputRetriesARefusedChannel(t *testing.T) {
	fake := &fakeConn{errs: []error{errRefused}}

	out, err := Wrap(fake).GetCmd("uname", "-r").Output(context.Background())
	if err != nil || string(out) != "ok" {
		t.Fatalf("want ok and no error, got %q, %v", out, err)
	}
	if fake.sessions != 2 {
		t.Errorf("want 2 sessions, got %d", fake.sessions)
	}
}

func TestRunRetriesARefusedChannel(t *testing.T) {
	fake := &fakeConn{errs: []error{errRefused, errRefused}}

	if err := Wrap(fake).GetCmd("true").Run(context.Background()); err != nil {
		t.Fatalf("want no error, got %v", err)
	}
	if fake.sessions != 3 {
		t.Errorf("want 3 sessions, got %d", fake.sessions)
	}
}

func TestReadFileRetriesARefusedChannel(t *testing.T) {
	// ReadFile returns the channel error without a prefix.
	fake := &fakeConn{errs: []error{errors.Unwrap(errRefused)}}

	r, err := Wrap(fake).ReadFile("/etc/os-release")
	if err != nil {
		t.Fatalf("want no error, got %v", err)
	}
	r.Close()
	if fake.sessions != 2 {
		t.Errorf("want 2 sessions, got %d", fake.sessions)
	}
}

func TestRetryBoundsItsAttempts(t *testing.T) {
	fake := &fakeConn{errs: []error{errRefused, errRefused, errRefused, errRefused}}

	_, err := Wrap(fake).GetCmd("uname").Output(context.Background())
	if !errors.Is(err, errRefused) {
		t.Fatalf("want the refusal, got %v", err)
	}
	if want := len(Backoff) + 1; fake.sessions != want {
		t.Errorf("want %d sessions, got %d", want, fake.sessions)
	}
}

// These errors can arrive after the command started, so running it again could
// run a `reboot` twice.
func TestNoRetryWhenTheCommandMayHaveRun(t *testing.T) {
	for _, err := range []error{
		errExited,
		io.EOF,
		errors.New("ssh: connection lost"),
		errors.New("ssh: rejected: connect failed (open failed)"), // text alone, no typed error
	} {
		fake := &fakeConn{errs: []error{err}}

		if got := Wrap(fake).GetCmd("reboot").Run(context.Background()); !errors.Is(got, err) {
			t.Errorf("want %v back, got %v", err, got)
		}
		if fake.sessions != 1 {
			t.Errorf("%v: want a single session, got %d", err, fake.sessions)
		}
	}
}

func TestRetryStopsWhenTheContextEnds(t *testing.T) {
	fake := &fakeConn{errs: []error{errRefused, errRefused, errRefused}}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	if _, err := Wrap(fake).GetCmd("uname").Output(ctx); !errors.Is(err, errRefused) {
		t.Fatalf("want the refusal, got %v", err)
	}
	if fake.sessions != 1 {
		t.Errorf("want a single session, got %d", fake.sessions)
	}
}

func TestInteractiveAndListAreNotRetried(t *testing.T) {
	fake := &fakeConn{errs: []error{errRefused}}
	if _, _, _, _, err := Wrap(fake).GetCmd("inotifywait").Interactive(); !errors.Is(err, errRefused) {
		t.Errorf("Interactive: want the refusal, got %v", err)
	}
	if fake.sessions != 1 {
		t.Errorf("Interactive: want a single session, got %d", fake.sessions)
	}

	fake = &fakeConn{errs: []error{errRefused}}
	if _, err := Wrap(fake).List("/"); !errors.Is(err, errRefused) {
		t.Errorf("List: want the refusal, got %v", err)
	}
	if fake.sessions != 1 {
		t.Errorf("List: want a single session, got %d", fake.sessions)
	}
}
