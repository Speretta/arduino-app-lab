package terminal

// The terminal emulators are described in a platform independent way, every
// platform provides its own list of candidates and the way they are started.

import (
	"bytes"
	"errors"
	"fmt"
	"log/slog"
	"os/exec"
	"strings"
	"time"

	"github.com/arduino/go-paths-helper"
)

// startupTimeout is the time given to a terminal to report a failure. The
// terminals that do not support the arguments they received exit immediately
// with an error, the terminals that are working keep running or exit
// successfully right away.
const startupTimeout = 500 * time.Millisecond

// invocation is a way to run a command inside a terminal emulator.
type invocation struct {
	// args are the arguments passed to the terminal, the "{cmd}" placeholder is
	// replaced by the command to run.
	args []string
	// singleArg makes the placeholder be expanded to a single argument, some
	// terminals accept only one string after the option used to run a command.
	singleArg bool
}

// terminalCandidate is a terminal emulator known to the application.
type terminalCandidate struct {
	// ID identifies the terminal, it is the name of the executable or of the
	// application bundle.
	ID string
	// Label is the human readable name of the terminal.
	Label string
	// bundle is the name of the application bundle of the terminal, it is used
	// to find the terminal outside of the PATH (macOS).
	bundle string
	// app is set for the terminals that are opened as an application (macOS),
	// they run the wrapper script themselves.
	app *appLaunch
	// invocations are the ways to run the command inside the terminal, they
	// are tried in order because every terminal has its own convention.
	invocations []invocation
	// rawCommand expands the placeholder with the command to run instead of
	// the wrapper script, it is used by the terminals that run the command
	// with a shell of their own (wsl).
	rawCommand bool
}

// appLaunch describes how an application is opened with the wrapper script.
type appLaunch struct {
	// command is the executable used to open the application.
	command string
	// args are the arguments of the command, the "{script}" placeholder is
	// replaced by the path of the wrapper script.
	args []string
}

// launchContext holds the command to run inside the terminal.
type launchContext struct {
	// command are the arguments of the command to run.
	command []string
	// script is the path of the wrapper script.
	script string
	// extraArgs are the arguments added in front of the ones of the terminal.
	extraArgs []string
	// raw makes the terminal run the command with a shell of its own, the
	// wrapper script is not used.
	raw bool
}

// withExtraArgs returns a copy of the context with the given extra arguments.
func (c launchContext) withExtraArgs(extraArgs []string) launchContext {
	c.extraArgs = extraArgs
	return c
}

// launchTerminals starts the terminal selected by the user, when none is
// selected the first terminal that can be started is used.
func launchTerminals(candidates []terminalCandidate, opts Options, ctx launchContext) error {
	if preferred := strings.TrimSpace(opts.PreferredTerminal); preferred != "" {
		if err := launchPreferred(preferred, candidates, ctx); err == nil {
			return nil
		} else {
			slog.Warn("failed to start the selected terminal, falling back to the automatic detection", "terminal", preferred, "err", err)
		}
	}

	tried := []string{}
	for _, candidate := range candidates {
		path, err := lookupTerminal(candidate)
		if err != nil {
			continue
		}
		tried = append(tried, candidate.ID)
		if err := launchCandidate(candidate, path, ctx); err == nil {
			return nil
		} else {
			slog.Warn("[skip] start terminal", "terminal", candidate.ID, "err", err)
		}
	}

	if len(tried) == 0 {
		return errors.New("no terminal emulator found on this system")
	}
	return fmt.Errorf("no supported terminal found, tried: %s", strings.Join(tried, ", "))
}

// launchPreferred launches the terminal selected by the user. The selection is
// either the id of a known terminal or a custom command.
func launchPreferred(preferred string, candidates []terminalCandidate, ctx launchContext) error {
	if candidate, found := findCandidate(candidates, preferred); found {
		path, err := lookupTerminal(candidate)
		if err != nil {
			return fmt.Errorf("terminal not found: %s", candidate.ID)
		}
		return launchCandidate(candidate, path, ctx)
	}

	fields, err := splitCommand(preferred)
	if err != nil {
		return err
	}
	if len(fields) == 0 {
		return errors.New("empty terminal command")
	}
	binary, extraArgs := fields[0], fields[1:]
	path, err := lookupExecutable(binary)
	if err != nil {
		return fmt.Errorf("terminal not found: %s", binary)
	}

	// A known terminal is launched with the arguments it expects, the extra
	// arguments given by the user are added in front of them.
	if candidate, found := findCandidate(candidates, binary); found {
		return launchCandidate(candidate, path, ctx.withExtraArgs(extraArgs))
	}

	for _, inv := range genericInvocations() {
		args := expandInvocation(inv, ctx.withExtraArgs(extraArgs))
		slog.Info("Trying opening terminal", "terminal", binary, "args", args)
		if err := runTerminal(path, args); err == nil {
			return nil
		} else {
			slog.Warn("[skip] start terminal", "terminal", binary, "args", args, "err", err)
		}
	}
	return fmt.Errorf("failed to start the terminal: %s", binary)
}

// findCandidate returns the terminal with the given id.
func findCandidate(candidates []terminalCandidate, id string) (terminalCandidate, bool) {
	for _, candidate := range candidates {
		if candidate.ID == id {
			return candidate, true
		}
	}
	return terminalCandidate{}, false
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

// lookupExecutable returns the path of the given executable.
func lookupExecutable(name string) (string, error) {
	return exec.LookPath(name)
}
