import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  getAuthStatus,
  isAuthError,
  onRestart,
  parseAgentError,
  start,
  validateAuth,
} from '../../services';
import type { AgentDownReason } from '../../store';
import {
  useAiAssistantStore,
  useBoardSwitchStore,
  useChatStore,
} from '../../store';

// A validation is trusted this long, so the usual Editor<->Agent toggle skips the loader.
const AUTH_FRESH_MS = 900_000; // 15 minutes

// Why the agent is being restarted: the user pressed Reconnect, or a board switch they confirmed did it.
type ReviveMode = 'manual' | 'auto';

// The host names its deliberate teardowns on the restart event; anything else was a crash.
const teardownReason = (reason?: string): AgentDownReason =>
  reason === 'board-changed' || reason === 'board-flashed' ? reason : 'crashed';

export interface AiAssistantPanelLogic {
  loading: boolean;
  authenticated: boolean;
  agentDown: boolean;
  agentDownReason?: AgentDownReason;
  reconnecting: boolean;
  reconnect: VoidFunction;
  // Reviving on its own after a board switch the user confirmed — no prompt, just the loader.
  reviving: boolean;
}

// Picks the panel's screen (loader, reconnect, chat/connect) from the credential and agent liveness.
export const useAiAssistantPanelLogic = (): AiAssistantPanelLogic => {
  const auth = useAiAssistantStore((s) => s.auth);
  const setAuth = useAiAssistantStore((s) => s.setAuth);
  const setSessionExpired = useAiAssistantStore((s) => s.setSessionExpired);
  const authResolved = useAiAssistantStore((s) => s.authResolved);
  const setAuthResolved = useAiAssistantStore((s) => s.setAuthResolved);
  const setLastValidatedAt = useAiAssistantStore((s) => s.setLastValidatedAt);
  const agentDown = useAiAssistantStore((s) => s.agentDown);
  const agentDownReason = useAiAssistantStore((s) => s.agentDownReason);
  const setAgentDown = useAiAssistantStore((s) => s.setAgentDown);
  const [reviving, setReviving] = useState<ReviveMode>();

  const freshOnMount = useMemo(() => {
    const { auth: a, lastValidatedAt } = useAiAssistantStore.getState();
    return (
      a.authenticated &&
      lastValidatedAt !== undefined &&
      Date.now() - lastValidatedAt < AUTH_FRESH_MS
    );
  }, []);

  const [validating, setValidating] = useState(!freshOnMount);

  // Clearing agentDown remounts the chat, which replays the last session. The mode is what the panel
  // shows meanwhile: the prompt with a spinner, or the loader on its own.
  const revive = useCallback(
    (mode: ReviveMode): void => {
      void (async (): Promise<void> => {
        const { auth: current } = useAiAssistantStore.getState();
        if (!current.authenticated) {
          return;
        }
        setReviving(mode);
        try {
          await start(current.agentId);
          setAgentDown(false);
        } catch {
          // Still down: clearing the mode drops back to the prompt so the user can retry.
        } finally {
          setReviving(undefined);
        }
      })();
    },
    [setAgentDown],
  );

  const reconnect = useCallback((): void => revive('manual'), [revive]);

  // Only the give-up matters: the earlier events fire before each relaunch, so they say nothing yet.
  useEffect(
    () =>
      onRestart((restart) => {
        if (!restart.gaveUp) {
          return;
        }
        const reason = teardownReason(restart.reason);
        // A crash comes back to the same board, so the session to reopen survives. A board switch does not:
        // the list is scoped to the board and app ids repeat across them, so a kept pointer reopens another
        // board's chat under a row this sidebar no longer has. A flash leaves the board in place but takes
        // its apps, so those pointers are just as dead.
        if (reason === 'crashed') {
          useChatStore.getState().resetLoadedSessions(); // the replacement process has none loaded
        } else {
          useChatStore.getState().reset();
        }
        setAgentDown(true, reason);

        // A confirmed switch already answered "yes, interrupt it", so revive straight away instead of
        // asking again. A crash, a flash, or a switch nobody was asked about, still stops at the prompt:
        // after a flash the board is still rebooting, so there is nothing to revive onto yet.
        if (
          reason === 'board-changed' &&
          useBoardSwitchStore.getState().consumeConfirmed()
        ) {
          revive('auto');
        }
      }),
    [setAgentDown, revive],
  );

  // Re-probes on every mount, so an expired/revoked token is caught before the chat opens.
  useEffect(() => {
    // Skip the probe and slide the window, so continuous toggling keeps skipping the loader.
    if (freshOnMount) {
      // Signing in from Settings marks the credential fresh without mounting this panel, so without
      // this the first open would hang on the loader.
      setAuthResolved(true);
      setLastValidatedAt(Date.now());
      return;
    }
    let active = true;

    void getAuthStatus().then(async (status) => {
      if (!active) {
        return;
      }

      if (!status.authenticated) {
        setAuth({ authenticated: false });
        setAuthResolved(true);
        setValidating(false);
        return;
      }

      let started = false;
      try {
        await start(status.agentId);
        started = true;
        setAgentDown(false); // a start that lands clears an earlier give-up
      } catch {
        // start failed — fall back to the connect flow (re-install/start).
      }

      if (!active) {
        return;
      }

      if (!started) {
        setAuth({ authenticated: false });
      } else {
        try {
          await validateAuth();
          if (active) {
            setAuth(status);
            setLastValidatedAt(Date.now());
          }
        } catch (e) {
          const { message, code } = parseAgentError(e);
          if (active && isAuthError(message, code)) {
            setSessionExpired(true);
            setAuth({ authenticated: false });
          } else if (active) {
            setAuth(status); // couldn't verify (network) → open chat; prompt() still guards
          }
        }
      }

      if (active) {
        setAuthResolved(true);
        setValidating(false);
      }
    });
    return () => {
      active = false;
    };
  }, [
    freshOnMount,
    setAuth,
    setSessionExpired,
    setAuthResolved,
    setLastValidatedAt,
    setAgentDown,
  ]);

  return {
    // A stored `authenticated` is only trusted once this mount has confirmed it.
    loading: !authResolved || (validating && auth.authenticated),
    authenticated: auth.authenticated,
    agentDown: agentDown && auth.authenticated,
    agentDownReason,
    reconnecting: reviving !== undefined,
    reconnect,
    reviving: reviving === 'auto',
  };
};
