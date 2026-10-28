package terminal

// TerminalInfo describes a terminal emulator found on the system.
type TerminalInfo struct {
	// ID is the name of the executable, it is the stable identifier of the terminal.
	ID string `json:"id"`
	// Label is the human readable name of the terminal, shown in the UI.
	Label string `json:"label"`
	// Path is the absolute path of the executable.
	Path string `json:"path"`
}

// TerminalCatalog is the list of the terminal emulators available on the system.
type TerminalCatalog struct {
	// Supported is false on the platforms where the terminal emulator is fixed
	// (Windows and macOS), in that case the user cannot pick one.
	Supported bool `json:"supported"`
	// Terminals are the detected terminal emulators, in the order they are tried.
	Terminals []TerminalInfo `json:"terminals"`
}

// ListAvailable returns the terminal emulators detected on the system, in the
// order they are tried when no terminal has been explicitly selected.
func ListAvailable() TerminalCatalog {
	return TerminalCatalog{
		Supported: terminalSelectionSupported,
		Terminals: detectTerminals(),
	}
}
