package fs

import (
	"errors"
	"fmt"
	"io/fs"
	"sync/atomic"
	"testing"

	"github.com/arduino/arduino-app-cli/pkg/board/remote"
)

// statConn stubs out the one method StatPath uses; the embedded interface
// covers the rest of RemoteConn, which is never reached.
type statConn struct {
	remote.RemoteConn
	info remote.FileInfo
	err  error
}

func (c statConn) Stats(string) (remote.FileInfo, error) {
	return c.info, c.err
}

func TestStatPath(t *testing.T) {
	errUnreachable := errors.New("board unreachable")

	tests := []struct {
		name      string
		conn      statConn
		wantNil   bool
		wantIsDir bool
		wantErr   error
	}{
		{
			name: "file",
			conn: statConn{info: remote.FileInfo{Name: "app.yaml", IsDir: false}},
		},
		{
			name:      "directory",
			conn:      statConn{info: remote.FileInfo{Name: "sketch", IsDir: true}},
			wantIsDir: true,
		},
		{
			name:    "missing path resolves to nil, not an error",
			conn:    statConn{err: fs.ErrNotExist},
			wantNil: true,
		},
		{
			// The local backend wraps os.Stat's error rather than returning it bare.
			name:    "wrapped missing path is still recognised",
			conn:    statConn{err: fmt.Errorf("failed to get stats: %w", fs.ErrNotExist)},
			wantNil: true,
		},
		{
			// A path we cannot reach must not read as free, or a rename would
			// silently overwrite whatever is actually there.
			name:    "other errors propagate",
			conn:    statConn{err: errUnreachable},
			wantErr: errUnreachable,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := StatPath(tt.conn, "/apps/my_app/target")

			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Fatalf("Error mismatch\nGot: %v\nExpected: %v", err, tt.wantErr)
				}
				if got != nil {
					t.Errorf("Expected no node alongside an error, got %+v", got)
				}
				return
			}

			if err != nil {
				t.Fatalf("StatPath failed: %v", err)
			}

			if tt.wantNil {
				if got != nil {
					t.Errorf("Expected nil for a missing path, got %+v", got)
				}
				return
			}

			if got == nil {
				t.Fatal("Expected a node, got nil")
			}
			if got.IsDir != tt.wantIsDir {
				t.Errorf("IsDir mismatch\nGot: %v\nExpected: %v", got.IsDir, tt.wantIsDir)
			}
			if got.Path != "/apps/my_app/target" {
				t.Errorf("Path mismatch\nGot: %s\nExpected: /apps/my_app/target", got.Path)
			}
		})
	}
}

// flakyStatConn refuses Stats a fixed number of times before answering.
type flakyStatConn struct {
	remote.RemoteConn
	failures int32
	calls    atomic.Int32
}

func (c *flakyStatConn) Stats(string) (remote.FileInfo, error) {
	if c.calls.Add(1) <= c.failures {
		return remote.FileInfo{}, errors.New("ssh: rejected: connect failed (open failed)")
	}
	return remote.FileInfo{Name: "target", IsDir: true}, nil
}

// A stat competes with the listings for the board's sessions, so a refused one
// is retried rather than reported as "nothing is there".
func TestStatPathRetriesARefusedSession(t *testing.T) {
	conn := &flakyStatConn{failures: 1}

	got, err := StatPath(conn, "/apps/my_app/target")
	if err != nil {
		t.Fatalf("a stat that is refused once should be retried, got %v", err)
	}
	if got == nil || !got.IsDir {
		t.Fatalf("want the directory node, got %+v", got)
	}
	if conn.calls.Load() != 2 {
		t.Errorf("want 2 calls (one refusal, one success), got %d", conn.calls.Load())
	}
}
