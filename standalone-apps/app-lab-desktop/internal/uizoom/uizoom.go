// Package uizoom sets the page zoom of the app's webview, the same zoom a browser applies on Ctrl +.
//
// Wails v2 exposes no zoom API on macOS and Linux, so each platform file reaches its engine
// directly. CSS `zoom` on the document was rejected: it scales `vh` units, and the layout sizes
// its root containers with `100vh`.
package uizoom

const (
	Min = 0.5
	Max = 2.0
)

// Set applies factor (1 = 100%) to every webview the app owns, clamped to [Min, Max].
func Set(factor float64) {
	if factor < Min {
		factor = Min
	}
	if factor > Max {
		factor = Max
	}
	set(factor)
}
