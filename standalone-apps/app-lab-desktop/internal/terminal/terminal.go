package terminal

import (
	"app-lab-desktop/internal/board"
	"context"
	"fmt"
	"net"
	"strconv"

	oBoard "github.com/arduino/arduino-app-cli/pkg/board"

	"github.com/arduino/arduino-app-cli/pkg/board/remote/adb"
)

// Options customizes the way the terminal is opened.
type Options struct {
	// PreferredTerminal is the terminal emulator selected by the user:
	//   ""           the terminal is detected automatically, the first supported
	//                terminal found on the system is used
	//   "<id>"      the id of a terminal reported by ListAvailable (e.g. "alacritty")
	//   "<command>" a command line that launches a terminal (e.g. "wezterm start --"),
	//                the first field is the terminal and the other fields are its
	//                arguments
	// An empty value is also used when the selected terminal can not be started,
	// in that case the automatic detection is used as fallback.
	PreferredTerminal string
}

// OpenTerminal opens the shell of the given board in a terminal emulator.
//
// The context is not used: the terminal is started detached, so the call
// returns as soon as the terminal is running.
func OpenTerminal(ctx context.Context, b *board.Board, opts Options) error {
	if b == nil {
		return fmt.Errorf("no board selected")
	}

	switch b.Info.Protocol {
	case oBoard.SerialProtocol:
		validSerial, err := SanitizeSerialNumber(b.Info.Serial)
		if err != nil {
			return fmt.Errorf("invalid board serial port: %v", err)
		}
		err = openTerminalWithArgs(opts, []string{adb.FindAdbPath(), "-s", validSerial, "shell"}...)
		if err != nil {
			return err
		}
	case oBoard.NetworkProtocol:
		validAddress, err := SanitizeIPAddress(b.Info.Address)
		if err != nil {
			return fmt.Errorf("invalid board address: %v", err)
		}
		err = openTerminalWithArgs(opts, []string{"ssh", fmt.Sprintf("arduino@%s", validAddress)}...)
		if err != nil {
			return err
		}
	default:
		return fmt.Errorf("open terminal not supported for protocol %s", b.Info.Protocol)
	}

	return nil
}

func openTerminalWithArgs(opts Options, args ...string) error {
	return openTerminal(opts, args...)
}

func SanitizeIPAddress(address string) (string, error) {
	if sanitized := net.ParseIP(address); sanitized != nil {
		return address, nil
	}
	return "", fmt.Errorf("invalid IP address")
}

func SanitizeSerialNumber(serial string) (string, error) {
	if _, err := strconv.ParseUint(serial, 10, 32); err != nil {
		return "", fmt.Errorf("invalid serial number")
	}
	return serial, nil
}
