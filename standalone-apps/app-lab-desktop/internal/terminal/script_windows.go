//go:build windows

package terminal

import (
	"strings"
)

// scriptName is the name of the wrapper script.
const scriptName = "run.cmd"

// scriptContent returns the batch file that runs the given command and keeps
// the terminal open until the user presses a key.
func scriptContent(command []string) string {
	return strings.Join([]string{
		"@echo off",
		quoteWindowsArgs(command),
		"echo Press Enter to close...",
		"pause >nul",
		`del "%~f0" 2>nul`,
		`rmdir "%~dp0" 2>nul`,
		"",
	}, "\r\n")
}

// quoteWindowsArgs quotes the given arguments so they can be used in a batch
// file.
func quoteWindowsArgs(args []string) string {
	quoted := make([]string, 0, len(args))
	for _, arg := range args {
		quoted = append(quoted, quoteWindowsArg(arg))
	}
	return strings.Join(quoted, " ")
}

// quoteWindowsArg quotes a single argument so it can be used in a batch file.
func quoteWindowsArg(arg string) string {
	if arg == "" {
		return `""`
	}
	if !strings.ContainsAny(arg, " \t&()[]{}^=;!'+,`~") {
		return arg
	}
	return `"` + strings.ReplaceAll(arg, `"`, `""`) + `"`
}
