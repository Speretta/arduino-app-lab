package app

import (
	"app-lab-desktop/internal/agent"
	"app-lab-desktop/internal/airuntime"
	"app-lab-desktop/internal/arduinoapps"
	"app-lab-desktop/internal/auth"
	"app-lab-desktop/internal/board"
	"app-lab-desktop/internal/boardmcp"
	"app-lab-desktop/internal/context"
	"app-lab-desktop/internal/emoji"
	"app-lab-desktop/internal/errors"
	"app-lab-desktop/internal/fs"
	"app-lab-desktop/internal/fs/watcher"
	"app-lab-desktop/internal/hostread"
	"app-lab-desktop/internal/learn"
	"app-lab-desktop/internal/lsp"
	"app-lab-desktop/internal/update"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

type App struct {
	ctxHolder      *context.Holder
	version        string
	updater        *update.Updater
	learnSvc       *learn.Learn
	AuthFlow       *auth.Flow
	detectedBoards []*board.Board
	selectedBoard  *board.Board
	boardMu        sync.RWMutex // guards the selectedBoard reassignment in selectBoard against the agent's readers (boardSnapshot)
	lspHandler     *lsp.LSPHandler
	watcher        *watcher.WatchManager
	hostReads      *hostread.AllowSet
	releaseFiles   *arduinoapps.ReleaseFiles

	// Single active agent at a time; its id is tracked so the FE can drive which agent is used.
	runtimeMgr        *airuntime.Manager
	runtimeAgent      airuntime.AgentID
	runtimeMu         sync.Mutex
	agentMgr          *agent.Manager
	agentMgrID        airuntime.AgentID
	agentAPIKey       string                   // API key to inject at start when the user signed in with one; cached here after sign-in and persisted in the OS keychain (agentauth) so it survives restarts
	agentAPIKeyAt     time.Time                // when the API key was entered this session, for the settings "connected" line
	probeSessionID    string                   // id of the throwaway auth-probe session, hidden from the session list
	probeSeen         bool                     // the probe has appeared in the agent's list at least once (guarded by agentMu), so its later absence really means deleted
	boardMCP          *boardmcp.Server         // in-process board MCP server for the running agent (started/stopped with it)
	modelInstalls     *boardmcp.ModelInstaller // model downloads in flight; per process, so an agent restart cannot open a second one
	pendingLogin      *pendingLogin            // the running subscription sign-in, so a pasted code can reach it
	installing        bool                     // a runtime install is in flight (guarded by agentMu): the agent must not be started onto a half-written tree
	agentMu           sync.Mutex
	storeMu           sync.Mutex            // guards every client-side JSON store in the agent config dir: session titles, statuses, workspaces, pins, and the workspace grants
	grantsRev         atomic.Uint64         // bumped when a rename or delete rewrites the grants file behind the agent
	checkedOut        map[string]checkedApp // appID → local mirror the agent checked out (for turn-end reverse-sync)
	ghostMirrors      map[string]bool       // stranded-edit mirror dirs → warning already delivered (newer edits re-arm it)
	pendingSyncIssues map[string]syncIssue  // appID → pending sync warnings; failures clear on a clean sync, conflicts on re-checkout
	turnStart         time.Time             // start of the current agent turn: mid-turn ghost sweeps ignore older edits
	boardGen          uint64                // bumped on every board change (guarded by checkoutMu): a mirror sync from a previous board must not write to the new one
	checkoutMu        sync.Mutex            // guards checkedOut, ghostMirrors, pendingSyncIssues and turnStart
}

func New(version string, learnSvc *learn.Learn) *App {

	ctxHolder := context.NewHolder()
	a := &App{
		ctxHolder:         ctxHolder,
		version:           version,
		learnSvc:          learnSvc,
		selectedBoard:     board.Noop(),
		hostReads:         hostread.NewAllowSet(),
		releaseFiles:      arduinoapps.NewReleaseFiles(),
		checkedOut:        map[string]checkedApp{},
		ghostMirrors:      map[string]bool{},
		pendingSyncIssues: map[string]syncIssue{},
	}
	a.lspHandler = lsp.NewLSPHandler(ctxHolder, a.hostReads, func() *board.Board { return a.selectedBoard })
	return a
}

func (a *App) GetTitle() string {
	return "Arduino App Lab - " + a.GetCurrentVersion()
}

func (a *App) HandleSecondInstanceLaunch(secondInstanceData options.SecondInstanceData) {
	for _, arg := range secondInstanceData.Args {
		if strings.HasPrefix(arg, "arduino-app-lab://") {
			ctx := a.ctxHolder.Get()
			if a.AuthFlow != nil {
				a.AuthFlow.HandleAuthRedirect(ctx, arg)
			}
			return
		}
	}
}

func (a *App) OnUrlOpen(url string) {
	ctx := a.ctxHolder.Get()

	if a.AuthFlow != nil {
		a.AuthFlow.HandleAuthRedirect(ctx, url)
	}
}

func (a *App) GetAboutMessage() string {
	return fmt.Sprintf(
		`Version: %s

		Copyright © 2025 Arduino SA
		www.arduino.cc
		`,
		a.version,
	)
}

func (a *App) GetAssetMiddleware() assetserver.Middleware {
	return assetserver.ChainMiddleware(
		CSPMiddleware(cspPolicy),
		fs.FileContentAssetMiddleware(a.ctxHolder, a.selectedBoard),
		learn.AssetMiddleware(a.ctxHolder, a.learnSvc),
		emoji.AssetMiddleware(a.ctxHolder),
	)
}

func (a *App) GetErrorFormatter() options.ErrorFormatter {
	return errors.ChainErrorMiddleware([]errors.ErrorMiddleware{
		errors.TunnelSSHAuthFailedMiddleware(),
		errors.HwErrorMiddleware(),
	})
}
