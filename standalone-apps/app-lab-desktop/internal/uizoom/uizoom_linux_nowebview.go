//go:build linux && !desktop && !dev

package uizoom

// Plain `go build` and `go test`, as CI runs them, have no GTK or WebKitGTK headers. Wails adds
// the desktop tag to `wails build` and the dev tag to `wails dev`, so the app always gets
// uizoom_linux.go.
func set(float64) {}

// Available reports whether set can change the zoom on this machine.
func Available() bool { return false }
