//go:build !linux

package instance

// Claim always starts App Lab. Windows relies on Wails' SingleInstanceLock,
// and macOS runs without an instance lock (see getInstanceLockOptions in main.go).
func Claim(string) bool {
	return true
}
