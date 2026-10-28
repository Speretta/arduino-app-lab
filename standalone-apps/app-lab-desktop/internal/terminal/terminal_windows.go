//go:build windows

package terminal

import (
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// terminalSelectionSupported tells if the user can pick the terminal emulator.
// On the platforms where the terminal is detected from the system the user can
// choose one, on the other platforms the terminal emulator is a fixed one.
const terminalSelectionSupported = true

// windowsTerminals are the terminal emulators known to the application, in the
// order they are tried when the user has not selected one.
var windowsTerminals = []terminalCandidate{
	{ID: "wt.exe", Label: "Windows Terminal", invocations: []invocation{
		{args: []string{"-w", "new", "cmd.exe", "/C", "{cmd}"}},
	}},
	{ID: "cmd.exe", Label: "Command Prompt", invocations: []invocation{
		{args: []string{"/C", "{cmd}"}},
	}},
	{ID: "powershell.exe", Label: "Windows PowerShell", invocations: []invocation{
		{args: []string{"-Command", "& '{cmd}'"}},
	}},
	{ID: "pwsh.exe", Label: "PowerShell", invocations: []invocation{
		{args: []string{"-Command", "& '{cmd}'"}},
	}},
	{ID: "ConEmu64.exe", Label: "ConEmu", invocations: []invocation{
		{args: []string{"-RunAs", "/cmd", "{cmd}"}},
	}},
	{ID: "tabby.exe", Label: "Tabby", invocations: []invocation{
		{args: []string{"run", "{cmd}"}},
	}},
	{ID: "alacritty.exe", Label: "Alacritty", invocations: []invocation{
		{args: []string{"-e", "cmd.exe", "/C", "{cmd}"}},
	}},
	// The Windows Subsystem for Linux runs the command with a linux shell, the
	// command is resolved inside the distribution instead of on windows.
	{ID: "wsl.exe", Label: "WSL", rawCommand: true, invocations: []invocation{
		{args: []string{"--", "sh", "-c", "{cmd}"}},
		{args: []string{"-e", "sh", "-c", "{cmd}"}},
	}},
}

// genericInvocations are used for the terminal emulators that are not known to
// the application, they cover the most common ways to run a command.
func genericInvocations() []invocation {
	return []invocation{
		{args: []string{"/C", "{cmd}"}},
		{args: []string{"/K", "{cmd}"}},
		{args: []string{"-e", "{cmd}"}},
	}
}

// detectTerminals returns the terminal emulators installed on the system, in the
// order they are tried.
func detectTerminals() []TerminalInfo {
	detected := []TerminalInfo{}
	for _, candidate := range windowsTerminals {
		path, err := lookupTerminal(candidate)
		if err != nil {
			slog.Debug("terminal not installed", "terminal", candidate.ID)
			continue
		}
		detected = append(detected, TerminalInfo{
			ID:    candidate.ID,
			Label: candidate.Label,
			Path:  path,
		})
	}
	return detected
}

// lookupTerminal returns the path of the executable of the given terminal.
func lookupTerminal(candidate terminalCandidate) (string, error) {
	if candidate.app != nil {
		return "", nil
	}
	return exec.LookPath(candidate.ID)
}

// launchCandidate starts the given terminal with the invocations it supports.
func launchCandidate(candidate terminalCandidate, path string, ctx launchContext) error {
	if candidate.rawCommand {
		// The command is run by a shell of the terminal, it is resolved there
		// and not on the host.
		ctx.command = remoteCommand(ctx.command)
		ctx.raw = true
	}

	for _, inv := range candidate.invocations {
		args := expandInvocation(inv, ctx.withExtraArgs(mergeExtraArgs(inv, ctx.extraArgs)))
		slog.Info("Trying opening terminal", "terminal", candidate.ID, "args", args)
		if err := runTerminal(path, args); err == nil {
			return nil
		} else {
			slog.Warn("[skip] start terminal", "terminal", candidate.ID, "args", args, "err", err)
		}
	}
	return fmt.Errorf("failed to start the terminal: %s", candidate.ID)
}

// remoteCommand returns the command to run inside a remote environment (wsl),
// the executable is resolved by its name there.
func remoteCommand(command []string) []string {
	if len(command) == 0 {
		return command
	}
	remote := make([]string, len(command))
	copy(remote, command)
	name := filepath.Base(command[0])
	remote[0] = strings.TrimSuffix(name, ".exe")
	return remote
}

// expandInvocation replaces the placeholder of the invocation with the command
// to run.
func expandInvocation(inv invocation, ctx launchContext) []string {
	value := ctx.script
	if ctx.raw {
		value = shellQuoteAll(ctx.command)
	}

	args := make([]string, 0, len(ctx.extraArgs)+len(inv.args)+2)
	args = append(args, ctx.extraArgs...)
	for _, arg := range inv.args {
		if !strings.Contains(arg, "{cmd}") {
			args = append(args, arg)
			continue
		}
		args = append(args, strings.ReplaceAll(arg, "{cmd}", value))
	}
	return args
}

// openTerminal opens the given command in a terminal emulator.
func openTerminal(opts Options, args ...string) error {
	scriptPath, err := createWrapperScript(args)
	if err != nil {
		return err
	}

	ctx := launchContext{command: args, script: scriptPath}
	if err := launchTerminals(windowsTerminals, opts, ctx); err != nil {
		// The terminal was not started, the wrapper script will never run.
		os.RemoveAll(filepath.Dir(scriptPath))
		return err
	}
	return nil
}
