//go:build !windows

package terminal

import "strings"

// scriptName is the name of the wrapper script.
const scriptName = "run.sh"

// scriptContent returns the script that runs the given command and keeps the
// terminal open until the user presses enter.
func scriptContent(command []string) string {
	return strings.Join([]string{
		"#!/bin/sh",
		shellQuoteAll(command),
		`echo "Press Enter to close..."`,
		"read dummy",
		`rm -f "$0"`,
		`rmdir "$(dirname "$0")" 2>/dev/null`,
		"",
	}, "\n")
}
