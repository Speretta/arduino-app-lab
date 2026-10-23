package board

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
	"testing/fstest"
	"time"
)

const testFlasherName = "arduino-flasher-cli"

func testFlasherFS(bin string) fstest.MapFS {
	return fstest.MapFS{
		"res/" + testFlasherName:   {Data: []byte(bin)},
		"res/" + flasherCliLicense: {Data: []byte("GPL-3.0")},
	}
}

// versionDir is where a binary with this content must land under root.
func versionDir(root, bin string) string {
	sum := sha256.Sum256([]byte(bin))
	return filepath.Join(root, hex.EncodeToString(sum[:])[:12])
}

func readFile(t *testing.T, p string) string {
	t.Helper()
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func assertMode(t *testing.T, p string, want os.FileMode) {
	t.Helper()
	if runtime.GOOS == "windows" {
		return
	}
	info, err := os.Stat(p)
	if err != nil {
		t.Fatal(err)
	}
	if got := info.Mode().Perm(); got != want {
		t.Errorf("%s: mode %o, want %o", filepath.Base(p), got, want)
	}
}

func assertEntries(t *testing.T, dir string, want ...string) {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]bool{}
	for _, e := range entries {
		got[e.Name()] = true
	}
	if len(got) != len(want) {
		t.Errorf("entries %v, want %v", got, want)
	}
	for _, name := range want {
		if !got[name] {
			t.Errorf("missing %s in %v", name, got)
		}
	}
}

func assertNoStagingFiles(t *testing.T, root string) {
	t.Helper()
	_ = filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err == nil && strings.Contains(d.Name(), ".tmp-") {
			t.Errorf("staging file left behind: %s", p)
		}
		return nil
	})
}

// failingFS fails every read once it has served budget bytes in total, across all files.
type failingFS struct {
	fs.FS
	budget int
}

func (f *failingFS) Open(name string) (fs.File, error) {
	file, err := f.FS.Open(name)
	if err != nil {
		return nil, err
	}
	return &failingFile{File: file, fsys: f}, nil
}

type failingFile struct {
	fs.File
	fsys *failingFS
}

func (f *failingFile) Read(p []byte) (int, error) {
	if f.fsys.budget <= 0 {
		return 0, errors.New("read failed")
	}
	if len(p) > f.fsys.budget {
		p = p[:f.fsys.budget]
	}
	n, err := f.File.Read(p)
	f.fsys.budget -= n
	return n, err
}

func TestExtractFlasherCliWritesBinaryAndLicense(t *testing.T) {
	root := filepath.Join(t.TempDir(), "flasher-cli")

	bin, err := extractFlasherCli(testFlasherFS("v1"), "res", testFlasherName, root)
	if err != nil {
		t.Fatal(err)
	}

	dir := versionDir(root, "v1")
	if bin != filepath.Join(dir, testFlasherName) {
		t.Errorf("path %s, want it inside %s", bin, dir)
	}
	if got := readFile(t, bin); got != "v1" {
		t.Errorf("binary %q, want %q", got, "v1")
	}
	if got := readFile(t, filepath.Join(dir, flasherCliLicense)); got != "GPL-3.0" {
		t.Errorf("license %q", got)
	}
	assertMode(t, bin, 0755)
	assertMode(t, filepath.Join(dir, flasherCliLicense), 0644)
	assertEntries(t, dir, testFlasherName, flasherCliLicense)
	assertEntries(t, root, filepath.Base(dir))
}

func TestExtractFlasherCliReusesAMatchingCopy(t *testing.T) {
	root := filepath.Join(t.TempDir(), "flasher-cli")
	fsys := testFlasherFS("v1")

	bin, err := extractFlasherCli(fsys, "res", testFlasherName, root)
	if err != nil {
		t.Fatal(err)
	}
	before, err := os.Stat(bin)
	if err != nil {
		t.Fatal(err)
	}

	for range 3 {
		again, err := extractFlasherCli(fsys, "res", testFlasherName, root)
		if err != nil {
			t.Fatal(err)
		}
		if again != bin {
			t.Fatalf("second call returned %s, first %s", again, bin)
		}
	}

	after, err := os.Stat(bin)
	if err != nil {
		t.Fatal(err)
	}
	// A rewrite would replace the file: a running daemon is executing it.
	if !os.SameFile(before, after) {
		t.Error("a matching copy was replaced")
	}
	assertEntries(t, filepath.Dir(bin), testFlasherName, flasherCliLicense)
}

func TestExtractFlasherCliReplacesADamagedCopy(t *testing.T) {
	root := filepath.Join(t.TempDir(), "flasher-cli")
	dir := versionDir(root, "v2-full")
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, testFlasherName), []byte("v2-"), 0755); err != nil {
		t.Fatal(err)
	}

	bin, err := extractFlasherCli(testFlasherFS("v2-full"), "res", testFlasherName, root)
	if err != nil {
		t.Fatal(err)
	}

	if got := readFile(t, bin); got != "v2-full" {
		t.Errorf("binary %q, want %q", got, "v2-full")
	}
	assertMode(t, bin, 0755)
	assertEntries(t, dir, testFlasherName, flasherCliLicense)
}

func TestExtractFlasherCliKeepsTheGoodCopyWhenAWriteFails(t *testing.T) {
	root := filepath.Join(t.TempDir(), "flasher-cli")
	good, err := extractFlasherCli(testFlasherFS("v1"), "res", testFlasherName, root)
	if err != nil {
		t.Fatal(err)
	}
	before, err := os.Stat(good)
	if err != nil {
		t.Fatal(err)
	}

	v2 := strings.Repeat("v2", 4096)
	// Enough for the digest and half the copy.
	broken := &failingFS{FS: testFlasherFS(v2), budget: len(v2) + len(v2)/2}
	if _, err := extractFlasherCli(broken, "res", testFlasherName, root); err == nil {
		t.Fatal("no error for a failed write")
	}

	after, err := os.Stat(good)
	if err != nil {
		t.Fatalf("the good copy is gone: %v", err)
	}
	if !os.SameFile(before, after) || readFile(t, good) != "v1" {
		t.Error("the good copy was changed")
	}
	v2Bin := filepath.Join(versionDir(root, v2), testFlasherName)
	if _, err := os.Stat(v2Bin); !errors.Is(err, fs.ErrNotExist) {
		t.Errorf("a partial binary is at %s", v2Bin)
	}
	assertNoStagingFiles(t, root)

	bin, err := extractFlasherCli(testFlasherFS(v2), "res", testFlasherName, root)
	if err != nil {
		t.Fatal(err)
	}
	if bin != v2Bin || readFile(t, bin) != v2 {
		t.Error("the next call did not produce the whole binary")
	}
}

func TestExtractFlasherCliConcurrentCallsAllSucceed(t *testing.T) {
	root := filepath.Join(t.TempDir(), "flasher-cli")
	content := strings.Repeat("x", 1<<20)
	fsys := testFlasherFS(content)

	const n = 8
	paths := make([]string, n)
	errs := make([]error, n)
	var wg sync.WaitGroup
	for i := range n {
		wg.Add(1)
		go func() {
			defer wg.Done()
			paths[i], errs[i] = extractFlasherCli(fsys, "res", testFlasherName, root)
		}()
	}
	wg.Wait()

	for i := range n {
		if errs[i] != nil {
			t.Errorf("call %d: %v", i, errs[i])
			continue
		}
		if paths[i] != paths[0] {
			t.Errorf("call %d returned %s, call 0 %s", i, paths[i], paths[0])
		}
	}
	if t.Failed() {
		return
	}
	if readFile(t, paths[0]) != content {
		t.Error("wrong binary content")
	}
	assertEntries(t, filepath.Dir(paths[0]), testFlasherName, flasherCliLicense)
}

func TestExtractFlasherCliGivesEachBinaryItsOwnDirectory(t *testing.T) {
	root := filepath.Join(t.TempDir(), "flasher-cli")
	v1, err := extractFlasherCli(testFlasherFS("v1"), "res", testFlasherName, root)
	if err != nil {
		t.Fatal(err)
	}
	before, err := os.Stat(v1)
	if err != nil {
		t.Fatal(err)
	}

	v2, err := extractFlasherCli(testFlasherFS("v2"), "res", testFlasherName, root)
	if err != nil {
		t.Fatal(err)
	}

	if filepath.Dir(v1) == filepath.Dir(v2) {
		t.Fatalf("both binaries are in %s", filepath.Dir(v1))
	}
	after, err := os.Stat(v1)
	if err != nil {
		t.Fatalf("the v1 binary is gone: %v", err)
	}
	if !os.SameFile(before, after) || readFile(t, v1) != "v1" {
		t.Error("the v1 binary was replaced")
	}
	if readFile(t, v2) != "v2" {
		t.Error("wrong v2 content")
	}
}

func TestExtractFlasherCliRemovesLeftovers(t *testing.T) {
	root := filepath.Join(t.TempDir(), "flasher-cli")
	fsys := testFlasherFS("v1")
	bin, err := extractFlasherCli(fsys, "res", testFlasherName, root)
	if err != nil {
		t.Fatal(err)
	}
	dir := filepath.Dir(bin)

	old := time.Now().Add(-time.Hour)
	plant := func(p string, isDir, stale bool) {
		t.Helper()
		var err error
		if isDir {
			err = os.MkdirAll(p, 0755)
			if err == nil {
				err = os.WriteFile(filepath.Join(p, testFlasherName), []byte("other"), 0755)
			}
		} else {
			err = os.WriteFile(p, []byte("partial"), 0600)
		}
		if err == nil && stale {
			err = os.Chtimes(p, old, old)
		}
		if err != nil {
			t.Fatal(err)
		}
	}
	plant(filepath.Join(dir, testFlasherName+".tmp-111"), false, true)
	plant(filepath.Join(dir, flasherCliLicense+".tmp-222"), false, true)
	plant(filepath.Join(dir, testFlasherName+".tmp-333"), false, false)
	plant(filepath.Join(root, "aaaaaaaaaaaa"), true, true)
	plant(filepath.Join(root, "bbbbbbbbbbbb"), true, false)
	// The current directory is never removed, however old it looks.
	if err := os.Chtimes(dir, old, old); err != nil {
		t.Fatal(err)
	}

	if _, err := extractFlasherCli(fsys, "res", testFlasherName, root); err != nil {
		t.Fatal(err)
	}

	// The fresh ones may belong to a process that is extracting right now.
	assertEntries(t, dir, testFlasherName, flasherCliLicense, testFlasherName+".tmp-333")
	assertEntries(t, root, filepath.Base(dir), "bbbbbbbbbbbb")
}

func TestExtractFlasherCliReturnsAnErrorForAMissingResource(t *testing.T) {
	root := filepath.Join(t.TempDir(), "flasher-cli")
	fsys := fstest.MapFS{"res/" + testFlasherName: {Data: []byte("v1")}}

	if _, err := extractFlasherCli(fsys, "res", testFlasherName, root); err == nil {
		t.Fatal("no error for a missing license")
	}
	if _, err := extractFlasherCli(fstest.MapFS{}, "res", testFlasherName, root); err == nil {
		t.Fatal("no error for a missing binary")
	}
	assertNoStagingFiles(t, root)
}

func TestMoveIntoPlaceRetriesAndAcceptsAWinner(t *testing.T) {
	original := renameFile
	t.Cleanup(func() { renameFile = original })
	dir := t.TempDir()
	content := []byte("v1")
	want := sha256.Sum256(content)
	stage := func() string {
		t.Helper()
		f, err := os.CreateTemp(dir, testFlasherName+".tmp-*")
		if err == nil {
			_, err = f.Write(content)
		}
		if err == nil {
			err = f.Close()
		}
		if err != nil {
			t.Fatal(err)
		}
		return f.Name()
	}
	held := errors.New("file in use")

	t.Run("a held file is renamed once it is let go", func(t *testing.T) {
		dest := filepath.Join(dir, "retry")
		failures := 2
		renameFile = func(from, to string) error {
			if failures > 0 {
				failures--
				return held
			}
			return os.Rename(from, to)
		}
		if err := moveIntoPlace(stage(), dest, want[:]); err != nil {
			t.Fatal(err)
		}
		if readFile(t, dest) != "v1" {
			t.Error("wrong content")
		}
	})

	t.Run("a matching file put there by another process is accepted", func(t *testing.T) {
		dest := filepath.Join(dir, "winner")
		if err := os.WriteFile(dest, content, 0755); err != nil {
			t.Fatal(err)
		}
		renameFile = func(string, string) error { return held }
		staging := stage()
		if err := moveIntoPlace(staging, dest, want[:]); err != nil {
			t.Fatal(err)
		}
		if _, err := os.Stat(staging); !errors.Is(err, fs.ErrNotExist) {
			t.Error("the staging file was not removed")
		}
	})

	t.Run("a file that stays held is an error", func(t *testing.T) {
		dest := filepath.Join(dir, "held")
		if err := os.WriteFile(dest, []byte("v0"), 0755); err != nil {
			t.Fatal(err)
		}
		renameFile = func(string, string) error { return held }
		staging := stage()
		if err := moveIntoPlace(staging, dest, want[:]); !errors.Is(err, held) {
			t.Fatalf("error %v, want %v", err, held)
		}
		if _, err := os.Stat(staging); !errors.Is(err, fs.ErrNotExist) {
			t.Error("the staging file was not removed")
		}
		if readFile(t, dest) != "v0" {
			t.Error("the file in place was changed")
		}
	})
}
