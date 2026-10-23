//go:build linux

package instance

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/godbus/dbus/v5"
	"github.com/wailsapp/wails/v2/pkg/options"
)

const (
	waitForExit  = 10 * time.Second
	pollForExit  = 100 * time.Millisecond
	forwardLimit = 2 * time.Second
)

// Claim reports whether this process should start App Lab. It returns false
// when another App Lab of this user is running; the caller then exits.
//
// It must run before wails.Run. Wails' own SingleInstanceLock lets a second
// instance start when D-Bus fails, and it runs only after OnStartup has begun.
func Claim(uniqueID string) bool {
	f, run := claim(lockPath(), func() error { return forward(uniqueID) }, waitForExit, pollForExit)
	held = f
	return run
}

// lockPath is derived from the uid, not from the environment, so every launch
// of the user agrees on it, whatever its DBUS_SESSION_BUS_ADDRESS or HOME.
func lockPath() string {
	runDir := fmt.Sprintf("/run/user/%d", os.Getuid())
	if info, err := os.Stat(runDir); err == nil && info.IsDir() {
		return filepath.Join(runDir, "arduino-app-lab.lock")
	}
	cacheDir, err := os.UserCacheDir()
	if err != nil {
		cacheDir = os.TempDir()
	}
	return filepath.Join(cacheDir, "app-lab", "instance.lock")
}

// forward sends this launch's arguments to the running instance over the
// D-Bus name, path and method that Wails' SingleInstanceLock exports, so the
// running instance's OnSecondInstanceLaunch receives them unchanged.
func forward(uniqueID string) error {
	id := "wails_app_" + strings.ReplaceAll(strings.ReplaceAll(uniqueID, "-", "_"), ".", "_")
	name := "org." + id + ".SingleInstance"
	path := dbus.ObjectPath("/org/" + id + "/SingleInstance")

	conn, err := dbus.ConnectSessionBus()
	if err != nil {
		return err
	}
	defer conn.Close()

	wd, err := os.Getwd()
	if err != nil {
		return err
	}
	data, err := json.Marshal(options.SecondInstanceData{Args: os.Args[1:], WorkingDirectory: wd})
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), forwardLimit)
	defer cancel()
	return conn.Object(name, path).CallWithContext(ctx, name+".SendMessage", 0, string(data)).Store()
}
