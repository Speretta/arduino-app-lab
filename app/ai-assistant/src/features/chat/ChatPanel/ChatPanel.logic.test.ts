import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AgentUpdate,
  PermissionRequest,
  SessionId,
} from '../../../services';
import { useChatStore } from '../../../store';
import { permissionView, useChatLogic } from './ChatPanel.logic';

type UpdateHandler = (sessionId: SessionId, update: AgentUpdate) => void;

const services = vi.hoisted(() => ({
  handlers: [] as UpdateHandler[],
  unsubscribe: vi.fn(),
  newSession: vi.fn<() => Promise<string>>(),
  getSessionState: vi.fn<() => Promise<unknown>>(),
  listSessions: vi.fn<() => Promise<unknown[]>>(),
  prompt: vi.fn<() => Promise<void>>(),
}));

vi.mock('../../../services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services')>()),
  onUpdate: (handler: UpdateHandler): (() => void) => {
    services.handlers.push(handler);
    return services.unsubscribe;
  },
  onPermission: (): (() => void) => services.unsubscribe,
  newSession: services.newSession,
  getSessionState: services.getSessionState,
  listSessions: services.listSessions,
  prompt: services.prompt,
}));

const usage = (usedTokens: number): AgentUpdate => ({
  type: 'usage',
  usedTokens,
  contextSize: 0,
});

describe('useChatLogic — where a usage update lands', () => {
  beforeEach(() => {
    services.handlers.length = 0;
    services.newSession.mockReset().mockResolvedValue('on-screen');
    services.getSessionState
      .mockReset()
      .mockResolvedValue({ models: [], modes: [] });
    services.listSessions.mockReset().mockResolvedValue([]);
    useChatStore.getState().reset();
  });

  // The handler routes usage by the session the update names. Re-adding an `active` guard, or
  // reading sessionIdRef instead, puts a background turn's tokens on the visible counter.
  it("counts a background turn's tokens on its own session, not the visible one", async () => {
    renderHook(() => useChatLogic());
    await waitFor(() => expect(services.handlers.length).toBeGreaterThan(0));
    await waitFor(() =>
      expect(useChatStore.getState().threads['on-screen']).toBeDefined(),
    );

    // A session with a turn running in another panel: it has a thread, and its meters are open.
    useChatStore.getState().addMessage('background', {
      id: 'm1',
      role: 'user',
      parts: [{ type: 'text', id: 'm1-t0', text: 'hello' }],
    });
    useChatStore.getState().startTurnMeters('background');

    const emit = services.handlers[services.handlers.length - 1];
    act(() => {
      emit('background' as SessionId, usage(1_000));
      emit('background' as SessionId, usage(1_250));
    });

    expect(useChatStore.getState().threads['background']?.usedTokens).toBe(250);
    expect(useChatStore.getState().threads['on-screen']?.usedTokens ?? 0).toBe(
      0,
    );
  });
});

describe('useChatLogic — the editor beside a docked panel', () => {
  beforeEach(() => {
    services.newSession.mockReset().mockResolvedValue('on-screen');
    services.getSessionState
      .mockReset()
      .mockResolvedValue({ models: [], modes: [] });
    services.listSessions.mockReset().mockResolvedValue([]);
    services.prompt.mockReset().mockResolvedValue(undefined);
    useChatStore.getState().reset();
  });

  // Read at send time, so the agent gets the editor as it is when the user asks; the thread shows the text alone.
  it('sends what the editor holds with the prompt, and shows only the text', async () => {
    const editor = {
      file: {
        path: 'python/main.py',
        content: 'if a == True:\n    blink()\n',
        unsaved: false,
      },
      selection: {
        path: 'python/main.py',
        startLine: 1,
        endLine: 1,
        text: 'if a == True:',
      },
    };
    const getEditorContext = vi.fn(() => editor);
    const { result } = renderHook(() =>
      useChatLogic('app-1', 'Blink', true, getEditorContext),
    );
    await waitFor(() =>
      expect(result.current.currentSessionId).toBe('on-screen'),
    );
    expect(getEditorContext).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.send('What does this code do?');
    });

    expect(services.prompt).toHaveBeenCalledWith(
      'on-screen',
      'What does this code do?',
      editor,
    );
    const [message] =
      useChatStore.getState().threads['on-screen']?.messages ?? [];
    expect(message?.parts).toEqual([
      { type: 'text', id: expect.any(String), text: 'What does this code do?' },
    ]);
  });
});

describe('permissionView — plan approval', () => {
  it('hides the auto and bypass options claude-agent-acp sends', () => {
    const request: PermissionRequest = {
      id: 'p1',
      sessionId: 's1',
      toolCall: {
        id: 't1',
        title: 'Approve Plan',
        kind: 'switch_mode',
        status: 'pending',
      },
      options: [
        {
          id: 'exit-plan-default',
          label: 'Yes, manually approve edits',
          kind: 'allow_once',
        },
        {
          id: 'exit-plan-clear-auto',
          label: 'Yes, clear context and use auto mode',
          kind: 'allow_always',
        },
        {
          id: 'exit-plan-auto',
          label: 'Yes, and use auto mode',
          kind: 'allow_always',
        },
        {
          id: 'exit-plan-clear-bypass',
          label: 'Yes, clear context and bypass permissions',
          kind: 'allow_always',
        },
        {
          id: 'exit-plan-bypass',
          label: 'Yes, and bypass permissions',
          kind: 'allow_always',
        },
        { id: 'reject', label: 'No, keep planning', kind: 'reject_once' },
      ],
    };

    expect(permissionView(request).actions.map((a) => a.id)).toEqual([
      'exit-plan-default',
      'reject',
    ]);
  });
});
