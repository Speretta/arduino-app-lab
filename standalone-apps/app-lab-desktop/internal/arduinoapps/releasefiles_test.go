package arduinoapps

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"encoding/base64"
	"os"
	"path/filepath"
	"reflect"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"app-lab-desktop/internal/hostread"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

func TestReleaseIsWrittenOnlyWhereTheUserChose(t *testing.T) {
	dest := filepath.Join(t.TempDir(), "Magic_Storyteller_1.0")
	files := NewReleaseFiles()
	files.saveDialog = func(_ context.Context, options runtime.SaveDialogOptions) (string, error) {
		if options.DefaultFilename != "Magic_Storyteller_1.0.ard" {
			t.Errorf("unexpected default file name %q", options.DefaultFilename)
		}
		return dest, nil
	}

	chosen, err := files.ChooseSavePath(context.Background(), "Magic_Storyteller_1.0.ard")
	if err != nil || chosen != dest+releaseArchiveExt {
		t.Fatalf("expected the extension to be added, got %q (%v)", chosen, err)
	}

	content := base64.StdEncoding.EncodeToString([]byte("archive bytes"))
	if err := files.Write(chosen, content); err != nil {
		t.Fatalf("failed to write the release: %v", err)
	}
	written, err := os.ReadFile(chosen)
	if err != nil || string(written) != "archive bytes" {
		t.Errorf("unexpected content %q (%v)", written, err)
	}

	if err := files.Write(chosen, content); err == nil {
		t.Error("a chosen path must be writable once")
	}
	if err := files.Write(filepath.Join(t.TempDir(), "other.ard"), content); err == nil {
		t.Error("a path never chosen must be refused")
	}
}

func TestClosingTheSaveDialogChoosesNothing(t *testing.T) {
	files := NewReleaseFiles()
	files.saveDialog = func(context.Context, runtime.SaveDialogOptions) (string, error) { return "", nil }

	chosen, err := files.ChooseSavePath(context.Background(), "x.ard")
	if err != nil || chosen != "" {
		t.Fatalf("expected a silent cancel, got %q (%v)", chosen, err)
	}
}

func TestSaveDialogsOpenOneAtATime(t *testing.T) {
	dir := t.TempDir()
	var open, most atomic.Int32
	files := NewReleaseFiles()
	files.saveDialog = func(_ context.Context, options runtime.SaveDialogOptions) (string, error) {
		now := open.Add(1)
		for {
			seen := most.Load()
			if now <= seen || most.CompareAndSwap(seen, now) {
				break
			}
		}
		time.Sleep(20 * time.Millisecond)
		open.Add(-1)
		return filepath.Join(dir, options.DefaultFilename), nil
	}

	var wg sync.WaitGroup
	for _, name := range []string{"first.ard", "second.ard", "third.ard"} {
		wg.Add(1)
		go func(name string) {
			defer wg.Done()
			chosen, err := files.ChooseSavePath(context.Background(), name)
			if err != nil || filepath.Base(chosen) != name {
				t.Errorf("%s chose %q (%v)", name, chosen, err)
			}
		}(name)
	}
	wg.Wait()

	if most.Load() != 1 {
		t.Errorf("expected one save dialog at a time, saw %d", most.Load())
	}
}

func TestReadReleaseArchiveNeedsASelectedArchive(t *testing.T) {
	dir := t.TempDir()
	archive := filepath.Join(dir, "magic.ard")
	if err := os.WriteFile(archive, []byte("archive bytes"), 0o600); err != nil {
		t.Fatal(err)
	}
	secret := filepath.Join(dir, "id_rsa")
	if err := os.WriteFile(secret, []byte("PRIVATE KEY"), 0o600); err != nil {
		t.Fatal(err)
	}

	if _, err := ReadReleaseArchive(archive, hostread.NewAllowSet()); err == nil {
		t.Error("expected a path that was never selected to be refused")
	}

	allowed := hostread.NewAllowSet()
	allowed.Allow(archive, secret)
	if _, err := ReadReleaseArchive(secret, allowed); err == nil {
		t.Error("expected a file that is not a release archive to be refused")
	}
	content, err := ReadReleaseArchive(archive, allowed)
	if err != nil {
		t.Fatalf("expected the archive to be read: %v", err)
	}
	if decoded, _ := base64.StdEncoding.DecodeString(content); string(decoded) != "archive bytes" {
		t.Errorf("unexpected content %q", decoded)
	}
}

const sampleManifest = `schema: 1
name: Magic Storyteller
release_label: "1.0"
target: unoq
created_at: 2026-07-17T15:40:00Z
notes: |-
  # Fixes
  - upload over 100 MB
`

func writeReleaseArchive(t *testing.T, dir string) string {
	t.Helper()
	filePath := filepath.Join(dir, "magic.ard")
	file, err := os.Create(filePath)
	if err != nil {
		t.Fatal(err)
	}
	gz := gzip.NewWriter(file)
	tw := tar.NewWriter(gz)
	for name, content := range map[string]string{
		"magic-20260717-154000-unoq/release.yaml": sampleManifest,
	} {
		if err := tw.WriteHeader(&tar.Header{Name: name, Mode: 0o644, Size: int64(len(content))}); err != nil {
			t.Fatal(err)
		}
		if _, err := tw.Write([]byte(content)); err != nil {
			t.Fatal(err)
		}
	}
	for _, closer := range []interface{ Close() error }{tw, gz, file} {
		if err := closer.Close(); err != nil {
			t.Fatal(err)
		}
	}
	return filePath
}

func TestReadReleaseManifest(t *testing.T) {
	archive := writeReleaseArchive(t, t.TempDir())

	allowed := hostread.NewAllowSet()
	allowed.Allow(archive)
	manifest, err := ReadReleaseManifest(archive, allowed)
	if err != nil {
		t.Fatalf("expected the manifest to be read: %v", err)
	}
	expected := ReleaseManifest{
		Name:         "Magic Storyteller",
		ReleaseLabel: "1.0",
		CreatedAt:    "2026-07-17T15:40:00Z",
		Notes:        "# Fixes\n- upload over 100 MB",
	}
	if !reflect.DeepEqual(manifest, expected) {
		t.Errorf("got %+v, expected %+v", manifest, expected)
	}
}
