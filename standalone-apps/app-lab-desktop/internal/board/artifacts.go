package board

import (
	"bytes"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

//go:embed resources_index/package_index.tar.bz2
var packageIndex embed.FS

const flasherCliLicense = "arduino-flasher-cli.LICENSE"

// stagingInfix marks a file that is still being written, so a later call can recognise one left by an interrupted
// extraction.
const stagingInfix = ".tmp-"

// leftoverGracePeriod is how old a staging file or another version's directory must be before it is removed. Younger
// ones may belong to a process that is extracting right now: the mtime of a file being written stays fresh, and a
// directory's mtime changes whenever an entry is added to it. Writing the 25 MB binary takes seconds, even on the board.
const leftoverGracePeriod = 10 * time.Minute

// renameFile is os.Rename, replaced in tests.
var renameFile = os.Rename

// GetFlasherCli returns the path of an executable arduino-flasher-cli, extracting it from the embedded resources
// into the user's cache directory when the copy there is missing or differs from the embedded one.
func GetFlasherCli() (string, error) {
	name := "arduino-flasher-cli"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	cacheDir, err := os.UserCacheDir()
	if err != nil {
		return "", fmt.Errorf("could not get user's cache directory: %w", err)
	}
	srcDir := fmt.Sprintf("resources_%s_%s", runtime.GOOS, runtime.GOARCH)
	return extractFlasherCli(packagesFS, srcDir, name, filepath.Join(cacheDir, "arduino-app-lab", "flasher-cli"))
}

// extractFlasherCli puts the binary in a directory of rootDir named after its digest, so each binary has its own
// path. Two App Lab versions run at once during a macOS update, and neither may replace the file the other one runs:
// on Windows a running executable cannot be replaced at all.
//
// One fixed root rather than a fresh temporary directory per call: the binary is about 25 MB, and on the board /tmp
// is a RAM disk that nothing empties while the board runs.
func extractFlasherCli(fsys fs.FS, srcDir, name, rootDir string) (string, error) {
	binSrc := path.Join(srcDir, name)
	binDigest, err := digestOf(fsys.Open(binSrc))
	if err != nil {
		return "", fmt.Errorf("could not read embedded %s: %w", binSrc, err)
	}
	version := hex.EncodeToString(binDigest)[:12]
	destDir := filepath.Join(rootDir, version)
	if err := os.MkdirAll(destDir, 0755); err != nil {
		return "", fmt.Errorf("could not create %s: %w", destDir, err)
	}
	removeLeftovers(rootDir, version)

	binPath := filepath.Join(destDir, name)
	if err := installEmbedded(fsys, binSrc, binDigest, binPath, 0755); err != nil {
		return "", err
	}

	// The flasher is GPL-3.0; its LICENSE ships in the embed (extracted from
	// the upstream archive by download_resources.sh) and travels with the
	// binary wherever it is unpacked. 0644: a document, not an executable.
	licenseSrc := path.Join(srcDir, flasherCliLicense)
	licenseDigest, err := digestOf(fsys.Open(licenseSrc))
	if err != nil {
		return "", fmt.Errorf("could not read embedded %s: %w", licenseSrc, err)
	}
	if err := installEmbedded(fsys, licenseSrc, licenseDigest, filepath.Join(destDir, flasherCliLicense), 0644); err != nil {
		return "", err
	}

	return binPath, nil
}

// removeLeftovers removes, best effort, the staging files of interrupted extractions and the directories of other
// versions. Errors are ignored: on Windows a running executable cannot be removed, and the next call tries again.
func removeLeftovers(rootDir, version string) {
	if entries, err := os.ReadDir(rootDir); err == nil {
		for _, e := range entries {
			if e.Name() != version {
				removeIfStale(filepath.Join(rootDir, e.Name()))
			}
		}
	}
	if entries, err := os.ReadDir(filepath.Join(rootDir, version)); err == nil {
		for _, e := range entries {
			if strings.Contains(e.Name(), stagingInfix) {
				removeIfStale(filepath.Join(rootDir, version, e.Name()))
			}
		}
	}
}

func removeIfStale(p string) {
	if info, err := os.Lstat(p); err == nil && time.Since(info.ModTime()) > leftoverGracePeriod {
		_ = os.RemoveAll(p)
	}
}

// installEmbedded makes destPath a copy of the embedded file src, whose digest is want, with the given mode. A copy
// that already matches is left alone, so a daemon still running from it is not disturbed. Otherwise the file is
// written to a staging file beside it and renamed over it, so an interrupted write never leaves a truncated file at
// destPath.
func installEmbedded(fsys fs.FS, src string, want []byte, destPath string, mode os.FileMode) error {
	if matches(destPath, want) {
		if info, err := os.Stat(destPath); err == nil && info.Mode().Perm() == mode {
			return nil
		}
		return os.Chmod(destPath, mode)
	}

	staging, err := stageEmbedded(fsys, src, want, destPath, mode)
	if err != nil {
		return err
	}
	return moveIntoPlace(staging, destPath, want)
}

// stageEmbedded writes the embedded file src to a new staging file beside destPath and returns its path. The name is
// unique per call because goroutines and processes can extract the same version at the same time.
func stageEmbedded(fsys fs.FS, src string, want []byte, destPath string, mode os.FileMode) (string, error) {
	in, err := fsys.Open(src)
	if err != nil {
		return "", fmt.Errorf("could not open embedded %s: %w", src, err)
	}
	defer in.Close()

	out, err := os.CreateTemp(filepath.Dir(destPath), filepath.Base(destPath)+stagingInfix+"*")
	if err != nil {
		return "", fmt.Errorf("could not create a file beside %s: %w", destPath, err)
	}
	staging := out.Name()
	h := sha256.New()
	_, err = io.Copy(io.MultiWriter(out, h), in)
	// Close before the rename: Windows refuses to rename a file with an open handle.
	if closeErr := out.Close(); err == nil {
		err = closeErr
	}
	if err == nil && !bytes.Equal(h.Sum(nil), want) {
		err = fmt.Errorf("embedded %s changed while it was copied", src)
	}
	if err == nil {
		err = os.Chmod(staging, mode)
	}
	if err != nil {
		_ = os.Remove(staging)
		return "", fmt.Errorf("could not write %s: %w", destPath, err)
	}
	return staging, nil
}

// moveIntoPlace renames staging to destPath. On Windows an antivirus scanner can hold a file it has just seen
// written, so a failed rename is retried for a short time. If destPath already holds the same content, another
// process won the race and its copy is used.
func moveIntoPlace(staging, destPath string, want []byte) error {
	var err error
	for _, backoff := range []time.Duration{0, 100 * time.Millisecond, 250 * time.Millisecond} {
		time.Sleep(backoff)
		if err = renameFile(staging, destPath); err == nil {
			return nil
		}
		if matches(destPath, want) {
			_ = os.Remove(staging)
			return nil
		}
	}
	_ = os.Remove(staging)
	return fmt.Errorf("could not move %s into place: %w", destPath, err)
}

func matches(p string, want []byte) bool {
	have, err := digestOf(os.Open(p))
	return err == nil && bytes.Equal(have, want)
}

func digestOf(f io.ReadCloser, err error) ([]byte, error) {
	if err != nil {
		return nil, err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return nil, err
	}
	return h.Sum(nil), nil
}
