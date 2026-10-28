//go:build !linux

package terminal

import "errors"

// terminalSelectionSupported tells if the user can pick the terminal emulator.
// On Linux the terminal is detected from the system, on the other platforms the
// terminal emulator is a fixed one (cmd.exe on Windows, Terminal.app on macOS).
const terminalSelectionSupported = false

// detectTerminals returns the terminal emulators installed on the system, on the
// platforms where the terminal is a fixed one there is nothing to detect.
func detectTerminals() []TerminalInfo {
	return []TerminalInfo{}
}

// openLinuxTerminal is not available outside Linux, the terminal is opened with
// the platform specific terminal emulator.
func openLinuxTerminal(opts Options, args ...string) error {
	return errors.New("open terminal is not supported on this platform")
}
