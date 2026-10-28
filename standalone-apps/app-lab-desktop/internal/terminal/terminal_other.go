//go:build !linux && !darwin && !windows

package terminal

import "errors"

// terminalSelectionSupported tells if the user can pick the terminal emulator.
// On the platforms where the terminal is detected from the system the user can
// choose one, on the other platforms the terminal emulator is a fixed one.
const terminalSelectionSupported = false

// detectTerminals returns the terminal emulators installed on the system, on the
// platforms where the terminal is a fixed one there is nothing to detect.
func detectTerminals() []TerminalInfo {
	return []TerminalInfo{}
}

// openTerminal is not available on this platform, the terminal emulator is not
// known.
func openTerminal(opts Options, args ...string) error {
	return errors.New("open terminal is not supported on this platform")
}
