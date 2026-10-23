package fs

import (
	"strings"
	"testing"
)

// The roots the board reports in practice. They are a fixture here rather than
// a lookup because this is a test of the path check, not of where the dirs come
// from - board.AppFileRoots owns that.
var testAppFileRoots = []string{
	"/home/arduino/ArduinoApps",
	"/var/lib/arduino-app-cli",
}

// allowsRequest mirrors what ServeHTTP derives from a request URL, so the cases
// below can be written as the paths a webview would actually ask for.
func allowsRequest(urlPath string) bool {
	dir, file := splitAssetPath(strings.TrimPrefix(urlPath, pathPrefix))
	return isAllowedAssetPath(dir, file, testAppFileRoots)
}

func TestIsAllowedAssetPath(t *testing.T) {
	tests := []struct {
		name    string
		urlPath string
		want    bool
	}{
		{
			name:    "asset next to an app README",
			urlPath: pathPrefix + "/home/arduino/ArduinoApps/my-app/diagram.png",
			want:    true,
		},
		{
			name:    "asset in an app subfolder",
			urlPath: pathPrefix + "/home/arduino/ArduinoApps/my-app/docs/img/diagram.png",
			want:    true,
		},
		{
			name:    "asset in a bundled example",
			urlPath: pathPrefix + "/var/lib/arduino-app-cli/examples/blink/diagram.png",
			want:    true,
		},
		// The frontend builds these URLs by concatenating the route prefix with
		// an absolute app path, so the slash between them is doubled and the
		// remainder keeps its own. A single slash is what any normalization of
		// that URL would leave behind, and has to resolve the same way.
		{
			name:    "asset reached without the doubled slash",
			urlPath: pathPrefix + "home/arduino/ArduinoApps/my-app/diagram.png",
			want:    true,
		},
		{
			name:    "example reached without the doubled slash",
			urlPath: pathPrefix + "var/lib/arduino-app-cli/examples/blink/diagram.png",
			want:    true,
		},
		{
			name:    "absolute path outside the app roots",
			urlPath: pathPrefix + "/etc/passwd",
			want:    false,
		},
		{
			name:    "traversal out of the app roots",
			urlPath: pathPrefix + "/home/arduino/ArduinoApps/../../../etc/passwd",
			want:    false,
		},
		{
			name:    "relative traversal below the route",
			urlPath: pathPrefix + "../../etc/passwd",
			want:    false,
		},
		{
			name:    "sibling of the apps root sharing its prefix",
			urlPath: pathPrefix + "/home/arduino/ArduinoAppsEvil/diagram.png",
			want:    false,
		},
		{
			name:    "user dotfile next to the apps root",
			urlPath: pathPrefix + "/home/arduino/.ssh/id_rsa",
			want:    false,
		},
		{
			name:    "no path at all",
			urlPath: pathPrefix,
			want:    false,
		},
		{
			name:    "filesystem root",
			urlPath: pathPrefix + "/",
			want:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := allowsRequest(tt.urlPath); got != tt.want {
				t.Errorf("allowsRequest(%q) = %v, want %v", tt.urlPath, got, tt.want)
			}
		})
	}
}

// With no roots there is nothing to serve, rather than everything.
func TestIsAllowedAssetPathWithoutRoots(t *testing.T) {
	dir, file := splitAssetPath("/home/arduino/ArduinoApps/my-app/diagram.png")
	if isAllowedAssetPath(dir, file, nil) {
		t.Error("expected no roots to allow nothing")
	}
}

// The webview renders an <img> only when the response says it is an image, and
// for SVG the extension is the only thing that does.
func TestAssetContentType(t *testing.T) {
	tests := []struct {
		file string
		want string
	}{
		{file: "open_palm.svg", want: "image/svg+xml"},
		{file: "diagram.png", want: "image/png"},
		{file: "photo.jpg", want: "image/jpeg"},
		{file: "README", want: ""},
	}

	for _, tt := range tests {
		t.Run(tt.file, func(t *testing.T) {
			if got := assetContentType(tt.file); got != tt.want {
				t.Errorf("assetContentType(%q) = %q, want %q", tt.file, got, tt.want)
			}
		})
	}
}
