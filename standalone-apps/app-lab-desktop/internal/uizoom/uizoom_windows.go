package uizoom

// Wails v2 keeps the WebView2 controller private, so Go cannot set the zoom. Windows zooms with
// Ctrl + mouse wheel only (IsZoomControlEnabled in main.go): Wails turns off WebView2's browser
// keys, and Ctrl +, Ctrl - and Ctrl 0 are among them.
func set(float64) {}

// Available reports whether set can change the zoom on this machine.
func Available() bool { return false }
