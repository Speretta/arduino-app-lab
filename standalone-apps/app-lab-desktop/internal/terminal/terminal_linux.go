//go:build linux

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

// linuxTerminals are the terminal emulators known to the application, in the
// order they are tried when the user has not selected one.
var linuxTerminals = []terminalCandidate{
	{ID: "gnome-terminal", Label: "GNOME Terminal", invocations: []invocation{
		{args: []string{"--", "sh", "{cmd}"}},
	}},
	{ID: "konsole", Label: "Konsole", invocations: []invocation{
		{args: []string{"-e", "sh", "{cmd}"}},
		{args: []string{"-e", "{cmd}"}, singleArg: true},
	}},
	{ID: "xfce4-terminal", Label: "Xfce Terminal", invocations: []invocation{
		{args: []string{"-e", "{cmd}"}, singleArg: true},
	}},
	{ID: "mate-terminal", Label: "MATE Terminal", invocations: []invocation{
		// --disable-factory avoids GTK widget management issues:
		// error: "terminal_window_remove_screen: assertion 'gtk_widget_get_toplevel (GTK_WIDGET (screen)) == GTK_WIDGET (window)' failed\n"
		{args: []string{"--disable-factory", "-e", "{cmd}"}, singleArg: true},
	}},
	{ID: "ptyxis", Label: "Ptyxis", invocations: []invocation{
		{args: []string{"--", "sh", "{cmd}"}},
	}},
	{ID: "kgx", Label: "GNOME Console", invocations: []invocation{
		{args: []string{"-e", "{cmd}"}, singleArg: true},
		{args: []string{"--", "sh", "{cmd}"}},
	}},
	{ID: "alacritty", Label: "Alacritty", invocations: []invocation{
		{args: []string{"-e", "sh", "{cmd}"}},
		{args: []string{"--", "sh", "{cmd}"}},
	}},
	{ID: "kitty", Label: "Kitty", invocations: []invocation{
		{args: []string{"sh", "{cmd}"}},
	}},
	{ID: "ghostty", Label: "Ghostty", invocations: []invocation{
		{args: []string{"-e", "sh", "{cmd}"}},
	}},
	{ID: "wezterm", Label: "WezTerm", invocations: []invocation{
		{args: []string{"start", "--", "sh", "{cmd}"}},
	}},
	{ID: "foot", Label: "Foot", invocations: []invocation{
		{args: []string{"sh", "{cmd}"}},
	}},
	{ID: "tilix", Label: "Tilix", invocations: []invocation{
		{args: []string{"-e", "{cmd}"}, singleArg: true},
	}},
	{ID: "terminator", Label: "Terminator", invocations: []invocation{
		{args: []string{"-x", "{cmd}"}, singleArg: true},
		{args: []string{"-e", "{cmd}"}, singleArg: true},
	}},
	{ID: "lxterminal", Label: "LXTerminal", invocations: []invocation{
		{args: []string{"-e", "{cmd}"}, singleArg: true},
	}},
	{ID: "xterm", Label: "XTerm", invocations: []invocation{
		{args: []string{"-e", "sh", "{cmd}"}},
	}},
	{ID: "urxvt", Label: "URxvt", invocations: []invocation{
		{args: []string{"-e", "sh", "{cmd}"}},
	}},
	{ID: "st", Label: "Suckless Terminal", invocations: []invocation{
		{args: []string{"-e", "sh", "{cmd}"}},
	}},
	{ID: "qterminal", Label: "QTerminal", invocations: []invocation{
		{args: []string{"-e", "{cmd}"}, singleArg: true},
	}},
	{ID: "io.elementary.terminal", Label: "Elementary Terminal", invocations: []invocation{
		{args: []string{"-e", "{cmd}"}, singleArg: true},
	}},
	{ID: "deepin-terminal", Label: "Deepin Terminal", invocations: []invocation{
		{args: []string{"-e", "{cmd}"}, singleArg: true},
	}},
	{ID: "terminology", Label: "Terminology", invocations: []invocation{
		{args: []string{"-e", "{cmd}"}, singleArg: true},
	}},
	{ID: "cool-retro-term", Label: "Cool Retro Term", invocations: []invocation{
		{args: []string{"-e", "{cmd}"}, singleArg: true},
	}},
	// x-terminal-emulator is a link to another terminal, it is the last resort
	// because the terminal it points to may not accept the '-e' argument.
	{ID: "x-terminal-emulator", Label: "Default Terminal", invocations: []invocation{
		{args: []string{"-e", "{cmd}"}, singleArg: true},
		{args: []string{"-e", "sh", "{cmd}"}},
	}},
}

// genericInvocations are used for the terminal emulators that are not known to
// the application, they cover the most common ways to run a command.
func genericInvocations() []invocation {
	return []invocation{
		{args: []string{"-e", "{cmd}"}, singleArg: true},
		{args: []string{"-e", "sh", "{cmd}"}},
		{args: []string{"--", "sh", "{cmd}"}},
		{args: []string{"sh", "{cmd}"}},
	}
}

// detectTerminals returns the terminal emulators installed on the system, in the
// order they are tried.
func detectTerminals() []TerminalInfo {
	detected := []TerminalInfo{}
	for _, candidate := range linuxTerminals {
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

// expandInvocation replaces the placeholder of the invocation with the command
// to run.
func expandInvocation(inv invocation, ctx launchContext) []string {
	args := make([]string, 0, len(ctx.extraArgs)+len(inv.args)+2)
	args = append(args, ctx.extraArgs...)
	for _, arg := range inv.args {
		if !strings.Contains(arg, "{cmd}") {
			args = append(args, arg)
			continue
		}
		if inv.singleArg {
			args = append(args, strings.ReplaceAll(arg, "{cmd}", "sh "+shellQuote(ctx.script)))
			continue
		}
		if arg == "{cmd}" {
			args = append(args, ctx.script)
			continue
		}
		args = append(args, strings.ReplaceAll(arg, "{cmd}", "sh "+shellQuote(ctx.script)))
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
	if err := launchTerminals(linuxTerminals, opts, ctx); err != nil {
		// The terminal was not started, the wrapper script will never run.
		os.RemoveAll(filepath.Dir(scriptPath))
		return err
	}
	return nil
}
