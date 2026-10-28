//go:build linux

package terminal

import (
	"bytes"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/arduino/go-paths-helper"
)

// terminalSelectionSupported tells if the user can pick the terminal emulator.
// On Linux the terminal is detected from the system, on the other platforms the
// terminal emulator is a fixed one (cmd.exe on Windows, Terminal.app on macOS).
const terminalSelectionSupported = true

// startupTimeout is the time given to a terminal to report a failure. Terminals
// that do not support the arguments they received exit immediately with an error,
// the terminals that are working keep running or exit successfully right away.
const startupTimeout = 500 * time.Millisecond

// invocation is a way to run the wrapper script inside a terminal emulator.
type invocation struct {
	// args are the arguments passed to the terminal, "{cmd}" is replaced by the
	// invocation of the wrapper script.
	args []string
	// singleArg makes the "{cmd}" placeholder be expanded to a single argument
	// (e.g. "sh /tmp/script.sh"), some terminals accept only one string after
	// the option used to run a command.
	singleArg bool
}

// terminalCandidate is a terminal emulator known to the application.
type terminalCandidate struct {
	// ID is the name of the executable, it is the stable identifier of the terminal.
	ID string
	// Label is the human readable name of the terminal.
	Label string
	// invocations are the ways to run a command inside the terminal, they are
	// tried in order because every terminal has its own convention.
	invocations []invocation
}

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
var genericInvocations = []invocation{
	{args: []string{"-e", "{cmd}"}, singleArg: true},
	{args: []string{"-e", "sh", "{cmd}"}},
	{args: []string{"--", "sh", "{cmd}"}},
	{args: []string{"sh", "{cmd}"}},
}

// detectTerminals returns the terminal emulators installed on the system, in the
// order they are tried.
func detectTerminals() []TerminalInfo {
	detected := []TerminalInfo{}
	for _, candidate := range linuxTerminals {
		path, err := exec.LookPath(candidate.ID)
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

// openLinuxTerminal opens the given command in a terminal emulator. The terminal
// selected by the user is tried first, the automatic detection is used as
// fallback.
func openLinuxTerminal(opts Options, args ...string) error {
	scriptPath, err := createWrapperScript(args)
	if err != nil {
		return err
	}

	if preferred := strings.TrimSpace(opts.PreferredTerminal); preferred != "" {
		if err := launchPreferred(preferred, scriptPath); err == nil {
			return nil
		} else {
			slog.Warn("failed to start the selected terminal, falling back to the automatic detection", "terminal", preferred, "err", err)
		}
	}

	tried := []string{}
	for _, candidate := range linuxTerminals {
		path, err := exec.LookPath(candidate.ID)
		if err != nil {
			continue
		}
		tried = append(tried, candidate.ID)
		if err := launchCandidate(candidate, path, scriptPath, nil); err == nil {
			return nil
		} else {
			slog.Warn("[skip] start terminal", "terminal", candidate.ID, "err", err)
		}
	}

	// The terminal was not started, the wrapper script will never be executed.
	os.RemoveAll(filepath.Dir(scriptPath))

	if len(tried) == 0 {
		return errors.New("no terminal emulator found on this system")
	}
	return fmt.Errorf("no supported terminal found, tried: %s", strings.Join(tried, ", "))
}

// launchPreferred launches the terminal selected by the user. The selection is
// either the id of a detected terminal or a custom command.
func launchPreferred(preferred string, scriptPath string) error {
	if candidate, found := findCandidate(preferred); found {
		path, err := exec.LookPath(candidate.ID)
		if err != nil {
			return fmt.Errorf("terminal not found: %s", candidate.ID)
		}
		return launchCandidate(candidate, path, scriptPath, nil)
	}

	fields, err := splitCommand(preferred)
	if err != nil {
		return err
	}
	if len(fields) == 0 {
		return errors.New("empty terminal command")
	}
	binary, extraArgs := fields[0], fields[1:]
	path, err := exec.LookPath(binary)
	if err != nil {
		return fmt.Errorf("terminal not found: %s", binary)
	}

	// A known terminal is launched with the arguments it expects, the extra
	// arguments given by the user are added in front of them.
	if candidate, found := findCandidate(binary); found {
		return launchCandidate(candidate, path, scriptPath, extraArgs)
	}

	for _, inv := range genericInvocations {
		args := inv.build(extraArgs, scriptPath)
		slog.Info("Trying opening terminal", "terminal", binary, "args", args)
		if err := runTerminal(path, args); err == nil {
			return nil
		} else {
			slog.Warn("[skip] start terminal", "terminal", binary, "args", args, "err", err)
		}
	}
	return fmt.Errorf("failed to start the terminal: %s", binary)
}

// launchCandidate launches the given terminal with the invocations it supports.
func launchCandidate(candidate terminalCandidate, path string, scriptPath string, extraArgs []string) error {
	for _, inv := range candidate.invocations {
		args := inv.build(mergeExtraArgs(inv, extraArgs), scriptPath)
		slog.Info("Trying opening terminal", "terminal", candidate.ID, "args", args)
		if err := runTerminal(path, args); err == nil {
			return nil
		} else {
			slog.Warn("[skip] start terminal", "terminal", candidate.ID, "args", args, "err", err)
		}
	}
	return fmt.Errorf("failed to start the terminal: %s", candidate.ID)
}

// mergeExtraArgs returns the extra arguments to add in front of the invocation,
// they are skipped when the invocation already provides them (e.g. the user
// selected "wezterm start --" and the terminal already runs "start --").
func mergeExtraArgs(inv invocation, extraArgs []string) []string {
	if len(extraArgs) == 0 {
		return nil
	}
	if len(inv.args) >= len(extraArgs) {
		matches := true
		for i, arg := range extraArgs {
			if inv.args[i] != arg {
				matches = false
				break
			}
		}
		if matches {
			return nil
		}
	}
	return extraArgs
}

// findCandidate returns the terminal with the given id.
func findCandidate(id string) (terminalCandidate, bool) {
	for _, candidate := range linuxTerminals {
		if candidate.ID == id {
			return candidate, true
		}
	}
	return terminalCandidate{}, false
}

// build expands the invocation with the wrapper script path and the extra
// arguments requested by the user.
func (inv invocation) build(extraArgs []string, scriptPath string) []string {
	args := make([]string, 0, len(extraArgs)+len(inv.args)+2)
	args = append(args, extraArgs...)
	for _, arg := range inv.args {
		if arg == "{cmd}" {
			if inv.singleArg {
				// The terminal accepts a single string with the command to run.
				args = append(args, "sh "+shellQuote(scriptPath))
			} else {
				args = append(args, scriptPath)
			}
			continue
		}
		args = append(args, arg)
	}
	return args
}

// runTerminal starts the terminal and waits for it to report a failure. The
// terminal is started detached, so the application is not blocked until the
// terminal window is closed.
func runTerminal(path string, args []string) error {
	cmd, err := paths.NewProcess(nil, append([]string{path}, args...)...)
	if err != nil {
		return err
	}

	var stdout, stderr bytes.Buffer
	cmd.RedirectStdoutTo(&stdout)
	cmd.RedirectStderrTo(&stderr)

	if err := cmd.Start(); err != nil {
		return err
	}

	exited := make(chan error, 1)
	go func() {
		exited <- cmd.Wait()
	}()

	select {
	case err := <-exited:
		if err == nil {
			// Some terminals exit successfully even when they failed to open
			// the window, in that case the error is reported on the stderr.
			if message := strings.TrimSpace(stderr.String()); isDisplayError(message) {
				return fmt.Errorf("failed to open the terminal window: %s", message)
			}
			// The terminal detached itself and the window is open.
			return nil
		}
		return fmt.Errorf("%w: %s", err, strings.TrimSpace(stderr.String()))
	case <-time.After(startupTimeout):
		// The terminal is running.
		return nil
	}
}

// isDisplayError tells if the given output reports that the terminal could not
// open its window.
func isDisplayError(output string) bool {
	for _, marker := range []string{
		"cannot open display",
		"unable to open display",
		"failed to open display",
		"cannot connect to display",
	} {
		if strings.Contains(strings.ToLower(output), marker) {
			return true
		}
	}
	return false
}

// createWrapperScript creates the script that runs the given command inside the
// terminal and keeps it open. The script removes itself once it terminates.
func createWrapperScript(args []string) (string, error) {
	dir, err := os.MkdirTemp("", "app-lab-terminal-")
	if err != nil {
		slog.Error("failed to create temporary directory", "err", err)
		return "", errors.New("fail to create temporary script")
	}
	cleanupStaleScripts(dir)

	scriptPath := filepath.Join(dir, "run.sh")
	content := fmt.Sprintf("#!/bin/sh\n%s\necho \"Press Enter to close...\"\nread dummy\nrm -f \"$0\"\nrmdir \"$(dirname \"$0\")\" 2>/dev/null\n",
		shellQuoteAll(args))
	if err := os.WriteFile(scriptPath, []byte(content), 0700); err != nil {
		slog.Error("failed to write file", "err", err, "path", scriptPath)
		os.RemoveAll(dir)
		return "", errors.New("fail to create temporary script")
	}
	return scriptPath, nil
}

// cleanupStaleScripts removes the scripts left behind by a previous run that
// were never executed.
func cleanupStaleScripts(currentDir string) {
	entries, err := os.ReadDir(os.TempDir())
	if err != nil {
		return
	}
	for _, entry := range entries {
		if !entry.IsDir() || !strings.HasPrefix(entry.Name(), "app-lab-terminal-") {
			continue
		}
		path := filepath.Join(os.TempDir(), entry.Name())
		if path == currentDir {
			continue
		}
		info, err := entry.Info()
		if err != nil || time.Since(info.ModTime()) < time.Hour {
			continue
		}
		os.RemoveAll(path)
	}
}
