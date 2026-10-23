import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentRestart } from '../../services';
import { useAiAssistantStore, useChatStore } from '../../store';
import { useAiAssistantPanelLogic } from './AiAssistantPanel.logic';

const services = vi.hoisted(() => ({
  getAuthStatus: vi.fn<() => Promise<unknown>>(),
  start: vi.fn<(agentId: string) => Promise<void>>(),
  validateAuth: vi.fn<() => Promise<void>>(),
  restartListeners: [] as ((restart: AgentRestart) => void)[],
}));

vi.mock('../../services', () => ({
  getAuthStatus: services.getAuthStatus,
  start: services.start,
  validateAuth: services.validateAuth,
  onRestart: (fn: (restart: AgentRestart) => void): VoidFunction => {
    services.restartListeners.push(fn);
    return (): void => {
      services.restartListeners = services.restartListeners.filter(
        (l) => l !== fn,
      );
    };
  },
  isAuthError: (): boolean => false,
  parseAgentError: (): { message: string } => ({ message: '' }),
}));

const emitRestart = (restart: AgentRestart): void =>
  act(() => services.restartListeners.forEach((l) => l(restart)));

// The loader the panel shows over the chat is driven entirely by this hook, and it has no timeout —
// whatever leaves `loading` true keeps the user out of the chat until App Lab is restarted.
describe('useAiAssistantPanelLogic', () => {
  beforeEach(() => {
    services.getAuthStatus.mockReset().mockResolvedValue({
      authenticated: true,
      agentId: 'claude',
    });
    services.start.mockReset().mockResolvedValue(undefined);
    services.validateAuth.mockReset().mockResolvedValue(undefined);
    services.restartListeners = [];
    useChatStore.getState().reset();
    useAiAssistantStore.setState({
      auth: { authenticated: false },
      authResolved: false,
      lastValidatedAt: undefined,
      agentDown: false,
    });
  });

  // Signing in from Settings marks the credential fresh without this panel ever mounting, so the
  // first open takes the skip-the-probe path with authResolved still false — which used to hang.
  it('clears the loader on a first open that follows a sign-in made from Settings', async () => {
    useAiAssistantStore.setState({
      auth: { authenticated: true, agentId: 'claude' },
      authResolved: false,
      lastValidatedAt: Date.now(),
    });

    const { result } = renderHook(() => useAiAssistantPanelLogic());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.authenticated).toBe(true);
    expect(services.getAuthStatus).not.toHaveBeenCalled(); // still trusts the fresh credential
  });

  it('probes and resolves when no validation is on record', async () => {
    const { result } = renderHook(() => useAiAssistantPanelLogic());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.authenticated).toBe(true);
    expect(services.validateAuth).toHaveBeenCalled();
  });

  // Past the freshness window the credential is re-probed, and an expired one has to reach the login
  // screen rather than the chat.
  it('re-validates a stale credential and drops to connect when the probe says signed out', async () => {
    services.getAuthStatus.mockResolvedValue({ authenticated: false });
    useAiAssistantStore.setState({
      auth: { authenticated: true, agentId: 'claude' },
      authResolved: false,
      lastValidatedAt: Date.now() - 3_600_000,
    });

    const { result } = renderHook(() => useAiAssistantPanelLogic());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.authenticated).toBe(false);
  });

  // The session list is scoped to the connected board and app ids repeat across boards, so a pointer kept
  // across a switch reopens the previous board's chat under a row the sidebar no longer lists.
  it('forgets the session to reopen when the agent went down for a board switch', async () => {
    const { result } = renderHook(() => useAiAssistantPanelLogic());
    await waitFor(() => expect(result.current.loading).toBe(false));
    useChatStore
      .getState()
      .setLastSession('s1', 'Camera init', { id: 'snack' });

    emitRestart({ attempt: 3, max: 3, gaveUp: true, reason: 'board-changed' });

    expect(useChatStore.getState().lastSessionId).toBeNull();
    expect(useChatStore.getState().lastSessionByWorkspace).toEqual({});
  });

  // A flash leaves the board in place but wipes the apps its chats are scoped to, so the pointers are as
  // dead as after a switch. The prompt has to say reflashed, not changed.
  it('forgets the session and names the reflash when the board was flashed', async () => {
    const { result } = renderHook(() => useAiAssistantPanelLogic());
    await waitFor(() => expect(result.current.loading).toBe(false));
    useChatStore
      .getState()
      .setLastSession('s1', 'Camera init', { id: 'snack' });

    emitRestart({ attempt: 3, max: 3, gaveUp: true, reason: 'board-flashed' });

    expect(useChatStore.getState().lastSessionId).toBeNull();
    await waitFor(() =>
      expect(result.current.agentDownReason).toBe('board-flashed'),
    );
  });

  // A crash comes back to the same board, so the chat the user was in is still theirs to resume.
  it('keeps it when the agent merely crashed', async () => {
    const { result } = renderHook(() => useAiAssistantPanelLogic());
    await waitFor(() => expect(result.current.loading).toBe(false));
    useChatStore
      .getState()
      .setLastSession('s1', 'Camera init', { id: 'snack' });

    emitRestart({ attempt: 3, max: 3, gaveUp: true });

    expect(useChatStore.getState().lastSessionId).toBe('s1');
    expect(useChatStore.getState().lastSessionByWorkspace['snack']?.id).toBe(
      's1',
    );
  });
});
