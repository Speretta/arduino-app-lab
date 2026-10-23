package arduinoapps

import (
	"context"
	"encoding/base64"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"app-lab-desktop/internal/hostread"

	"github.com/arduino/arduino-app-cli/pkg/release"
	"github.com/arduino/go-paths-helper"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const releaseArchiveExt = ".ard"

// ReleaseManifest is release.yaml as arduino-app-cli defines it, with the JSON
// names the frontend reads.
type ReleaseManifest struct {
	Name         string `json:"name"`
	ReleaseLabel string `json:"release_label,omitempty"`
	CreatedAt    string `json:"created_at"`
	Notes        string `json:"notes,omitempty"`
}

func toManifest(m release.ReleaseManifest) ReleaseManifest {
	return ReleaseManifest{
		Name:         m.Name,
		ReleaseLabel: m.ReleaseLabel,
		CreatedAt:    m.CreatedAt.Format(time.RFC3339),
		Notes:        m.Notes,
	}
}

// ReadReleaseManifest reads the manifest of an archive the user picked, with
// the reader arduino-app-cli ships for App Lab.
func ReadReleaseManifest(filePath string, hostReads *hostread.AllowSet) (ReleaseManifest, error) {
	if err := checkHostRead(filePath, hostReads, "release manifest read"); err != nil {
		return ReleaseManifest{}, err
	}
	manifest, err := release.ReadReleaseManifest(paths.New(filePath))
	if err != nil {
		return ReleaseManifest{}, err
	}
	return toManifest(manifest), nil
}

func isReleaseArchive(filePath *paths.Path) bool {
	return filePath.Ext() == releaseArchiveExt
}

type saveDialogFunc func(ctx context.Context, options runtime.SaveDialogOptions) (string, error)

// ReleaseFiles moves release archives between the webview and this computer.
// The requests to the board are the webview's; this only opens the dialogs and
// touches the files.
type ReleaseFiles struct {
	mu         sync.Mutex
	savePaths  map[string]bool
	saveDialog saveDialogFunc
	// Wails on Linux answers every file dialog on one shared channel, so two
	// dialogs open at once can each receive the other's path, and one release
	// would be saved under the other's name.
	dialogMu sync.Mutex
}

func NewReleaseFiles() *ReleaseFiles {
	return &ReleaseFiles{savePaths: map[string]bool{}, saveDialog: runtime.SaveFileDialog}
}

// ChooseSavePath asks where a release goes. An empty path means the user closed
// the dialog. Only a path chosen here can be written by Write.
func (r *ReleaseFiles) ChooseSavePath(ctx context.Context, defaultFileName string) (string, error) {
	r.dialogMu.Lock()
	filePath, err := r.saveDialog(ctx, runtime.SaveDialogOptions{
		DefaultFilename: defaultFileName,
		Title:           "Save App release",
		Filters: []runtime.FileFilter{
			{
				DisplayName: "App release (*.ard)",
				Pattern:     "*.ard",
			},
		},
	})
	r.dialogMu.Unlock()
	if err != nil {
		return "", fmt.Errorf("failed to open save dialog: %w", err)
	}
	if filePath == "" {
		return "", nil
	}
	// The GTK dialog does not add the extension of the filter.
	if !isReleaseArchive(paths.New(filePath)) {
		filePath += releaseArchiveExt
	}

	r.mu.Lock()
	r.savePaths[filePath] = true
	r.mu.Unlock()
	return filePath, nil
}

// Write stores a release the webview downloaded, once, at a path the user chose.
func (r *ReleaseFiles) Write(filePath string, contentBase64 string) error {
	r.mu.Lock()
	allowed := r.savePaths[filePath]
	delete(r.savePaths, filePath)
	r.mu.Unlock()
	if !allowed {
		slog.Error("release write denied: path was not chosen in a save dialog", "path", filePath)
		return fmt.Errorf("access denied: %s was not chosen in a save dialog", filePath)
	}

	content, err := base64.StdEncoding.DecodeString(contentBase64)
	if err != nil {
		return fmt.Errorf("failed to decode the release: %w", err)
	}
	if err := paths.New(filePath).WriteFile(content); err != nil {
		return fmt.Errorf("failed to save the release: %w", err)
	}
	return nil
}

// ReadReleaseArchive hands the webview a release archive the user picked, so it
// can read its manifest and upload it.
func ReadReleaseArchive(filePath string, hostReads *hostread.AllowSet) (string, error) {
	archive := paths.New(filePath)
	if !isReleaseArchive(archive) {
		return "", fmt.Errorf("%s is not a release archive", archive.Base())
	}
	if err := checkHostRead(filePath, hostReads, "release read"); err != nil {
		return "", err
	}
	content, err := archive.ReadFile()
	if err != nil {
		return "", fmt.Errorf("failed to read %s: %w", archive.Base(), err)
	}
	return base64.StdEncoding.EncodeToString(content), nil
}
