import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  chatDriver,
  subscribeWorkspaceAppForgotten,
  useChatStore,
} from './chatStore';

// The store's one runtime dependency on the services layer. The fake keeps the registered handler so a
// test can fire the event Go emits when an app is deleted, from the UI or by the agent's own apps_delete.
const forgottenHandlers = vi.hoisted((): ((appId: string) => void)[] => []);
vi.mock('../services', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  onWorkspaceAppForgotten: (handler: (appId: string) => void): VoidFunction => {
    forgottenHandlers.push(handler);
    return vi.fn();
  },
}));

// resetLoadedSessions is what makes a crashed-out agent recoverable. bootstrap only replays a session
// (loadSession) when it has no thread in memory, so a thread that outlives the agent process makes it
// skip the replay and go on prompting a session id the replacement process has never loaded.
describe('useChatStore.resetLoadedSessions', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  const openSession = (id: string, title: string): void => {
    const store = useChatStore.getState();
    store.setLastSession(id, title);
    store.setCurrentSessionId(id);
    store.addMessage(id, { id: 'm1', role: 'user', parts: [] });
    store.setSessionStreaming(id, true);
  };

  it('drops the in-memory threads but keeps the session to reopen', () => {
    openSession('sess-blink', 'Blink an LED on D13');

    useChatStore.getState().resetLoadedSessions();

    const state = useChatStore.getState();
    expect(state.threads).toEqual({}); // so bootstrap replays instead of trusting a dead thread
    expect(state.streamingSessions).toEqual({}); // a dead agent has no turn in flight
    expect(state.lastSessionId).toBe('sess-blink'); // the reconnect lands back in the same chat
    expect(state.lastSessionTitle).toBe('Blink an LED on D13');
  });

  // An unprompted draft only exists in the crashed process's memory — the agent never persisted it, so
  // replaying it would fail. Forgetting it sends the reconnect to a fresh chat instead of a dead end.
  it('forgets the session to reopen when it was an unprompted draft', () => {
    openSession('sess-draft', 'New chat');
    useChatStore.getState().setDraftSessionId('sess-draft');

    useChatStore.getState().resetLoadedSessions();

    expect(useChatStore.getState().lastSessionId).toBeNull();
    expect(useChatStore.getState().lastSessionTitle).toBeUndefined();
  });

  // The turn the teardown killed settles later (its Go epilogue syncs mirrors over the board being
  // swapped), so send()'s finally runs against the wiped store. Anything it recreated there would read
  // as a loaded thread and cost the reopened session its replay — the board switch would empty it.
  it('is not undone by the killed turn settling afterwards', () => {
    openSession('sess-blink', 'Blink an LED on D13');

    useChatStore.getState().resetLoadedSessions();
    const store = useChatStore.getState();
    store.setMessageError('sess-blink', 'm1', 'the agent stopped');
    store.setStreamingMessageId('sess-blink', undefined);
    store.setPendingPermission('sess-blink', undefined);
    store.setSessionStreaming('sess-blink', false);

    expect(useChatStore.getState().threads).toEqual({});
  });

  it('leaves the first message of a session free to start its thread', () => {
    openSession('sess-blink', 'Blink an LED on D13');
    useChatStore.getState().resetLoadedSessions();

    useChatStore
      .getState()
      .addMessage('sess-blink', { id: 'm1', role: 'user', parts: [] });

    expect(
      useChatStore.getState().threads['sess-blink']?.messages,
    ).toHaveLength(1);
  });

  it('keeps the session to reopen when the draft is a different one', () => {
    openSession('sess-blink', 'Blink an LED on D13');
    useChatStore.getState().setDraftSessionId('sess-other');

    useChatStore.getState().resetLoadedSessions();

    expect(useChatStore.getState().lastSessionId).toBe('sess-blink');
    expect(useChatStore.getState().draftSessionId).toBeNull();
  });
});

// Two panels can be mounted at once, and both subscribing doubles every update — a history replay included.
describe('chatStore — chat ownership', () => {
  const driver = (): string | undefined =>
    chatDriver(useChatStore.getState().chatOwners);

  beforeEach(() => {
    useChatStore.getState().chatOwners.forEach(({ id }) => {
      useChatStore.getState().releaseChat(id);
    });
  });

  it('gives the stream to the panel on screen, not the one that mounted last', () => {
    useChatStore.getState().claimChat('full-screen', true);
    useChatStore.getState().claimChat('editor', false);

    expect(driver()).toBe('full-screen');
  });

  // Clearing agentDown remounts the full-screen panel; hidden, it must not take the stream from the docked one.
  it('keeps it with the docked panel when the hidden one re-claims', () => {
    useChatStore.getState().claimChat('editor', true);
    useChatStore.getState().claimChat('full-screen', false);

    expect(driver()).toBe('editor');
  });

  // Editor mode with the side panel closed: nobody is on screen, but a background turn still needs watching.
  it('falls back to the last mounted panel when none is on screen', () => {
    useChatStore.getState().claimChat('full-screen', false);

    expect(driver()).toBe('full-screen');
  });

  it('hands it back when the driving panel goes', () => {
    useChatStore.getState().claimChat('full-screen', false);
    useChatStore.getState().claimChat('editor', true);
    expect(driver()).toBe('editor');

    useChatStore.getState().releaseChat('editor');
    expect(driver()).toBe('full-screen');
  });

  it('never leaves two owners for one panel', () => {
    useChatStore.getState().claimChat('full-screen', false);
    useChatStore.getState().claimChat('full-screen', true);

    expect(useChatStore.getState().chatOwners).toEqual([
      { id: 'full-screen', onScreen: true },
    ]);
  });

  // reset() clears session data on sign-out or a board switch, while the panels stay mounted.
  it('survives a reset', () => {
    useChatStore.getState().claimChat('full-screen', true);
    useChatStore.getState().reset();

    expect(driver()).toBe('full-screen');
  });
});

// Switching workspace must land on the chat that workspace was left on, not on whatever was open last anywhere else.
describe('chatStore — last session per workspace', () => {
  beforeEach(() => useChatStore.getState().reset());

  it('remembers one session per workspace', () => {
    const store = useChatStore.getState();
    store.setLastSession('s-blink', 'Blink chat', { id: 'app-blink' });
    store.setLastSession('s-general', 'General chat', { id: '' });

    const { lastSessionByWorkspace } = useChatStore.getState();
    expect(lastSessionByWorkspace['app-blink']).toEqual({
      id: 's-blink',
      title: 'Blink chat',
    });
    expect(lastSessionByWorkspace['']).toEqual({
      id: 's-general',
      title: 'General chat',
    });
  });

  it('forgets one workspace without touching the others', () => {
    const store = useChatStore.getState();
    store.setLastSession('s-blink', undefined, { id: 'app-blink' });
    store.setLastSession('s-other', undefined, { id: 'app-other' });

    useChatStore.getState().forgetWorkspaceSession('app-blink');

    const { lastSessionByWorkspace } = useChatStore.getState();
    expect(lastSessionByWorkspace['app-blink']).toBeUndefined();
    expect(lastSessionByWorkspace['app-other']?.id).toBe('s-other');
  });

  // The sidebar deletes by session, from any workspace: keying the cleanup on the open one would leave the deleted id behind.
  it('forgets a deleted session in whichever workspace remembered it', () => {
    const store = useChatStore.getState();
    store.setLastSession('s-blink', undefined, { id: 'app-blink' });
    store.setLastSession('s-other', undefined, { id: 'app-other' });

    useChatStore.getState().forgetSession('s-blink');

    const { lastSessionByWorkspace } = useChatStore.getState();
    expect(lastSessionByWorkspace['app-blink']).toBeUndefined();
    expect(lastSessionByWorkspace['app-other']?.id).toBe('s-other');
  });

  // A restart is allowed to forget where each workspace was; a sign-out mid-run is not different.
  it('is cleared by reset', () => {
    useChatStore
      .getState()
      .setLastSession('s-blink', undefined, { id: 'app-blink' });
    useChatStore.getState().reset();

    expect(useChatStore.getState().lastSessionByWorkspace).toEqual({});
  });

  // The agent process is replaced on restart: the surviving session keeps its place here too, or its workspace opens an empty chat.
  it('keeps the surviving session in the per-workspace map across a reset', () => {
    const store = useChatStore.getState();
    store.setLastSession('s-blink', 'Blink chat', { id: 'app-blink' });

    useChatStore.getState().resetLoadedSessions();

    expect(useChatStore.getState().lastSessionByWorkspace['app-blink']).toEqual(
      {
        id: 's-blink',
        title: 'Blink chat',
      },
    );
  });

  it('drops an unused draft from the map on a reset', () => {
    const store = useChatStore.getState();
    store.setLastSession('s-draft', undefined, { id: 'app-blink' });
    store.setDraftSessionId('s-draft');

    useChatStore.getState().resetLoadedSessions();

    expect(useChatStore.getState().lastSessionByWorkspace).toEqual({});
  });
});

// An app can go while no chat UI is mounted (My Apps, or the agent deleting it mid-turn), so the store
// subscribes for the whole session rather than leaving this to a panel's effect.
describe('chatStore — an app the host forgot', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    forgottenHandlers.length = 0;
    subscribeWorkspaceAppForgotten();
  });

  const forget = (appId: string): void => forgottenHandlers[0](appId);

  it('moves a chat open on the deleted app back to the whole board', () => {
    useChatStore
      .getState()
      .setLastSession('s-lamp', 'Lamp chat', { id: 'app-lamp', name: 'Lamp' });

    forget('app-lamp');

    const state = useChatStore.getState();
    expect(state.lastSessionId).toBeNull(); // nothing to resume: the chat went with the app
    expect(state.lastSessionByWorkspace['app-lamp']).toBeUndefined();
    expect(state.sessionRequest).toMatchObject({
      type: 'new',
      workspace: { id: '' },
    });
  });

  it('leaves a chat open on another app where it is', () => {
    useChatStore
      .getState()
      .setLastSession('s-fan', 'Fan chat', { id: 'app-fan', name: 'Fan' });

    forget('app-lamp');

    const state = useChatStore.getState();
    expect(state.lastSessionId).toBe('s-fan');
    expect(state.sessionRequest).toBeUndefined(); // no panel has to move
  });

  // The remembered pointer is what a later mount would resume from, so it has to go even with nothing open.
  it("drops the deleted app's remembered session with no chat open", () => {
    useChatStore
      .getState()
      .setLastSession('s-lamp', 'Lamp chat', { id: 'app-lamp', name: 'Lamp' });
    useChatStore.getState().setLastSession('s-general', 'General', { id: '' });

    forget('app-lamp');

    const state = useChatStore.getState();
    expect(state.lastSessionByWorkspace['app-lamp']).toBeUndefined();
    expect(state.lastSessionByWorkspace['']?.id).toBe('s-general');
    expect(state.lastSessionId).toBe('s-general'); // the open chat is elsewhere; it stays
  });
});

// The editor's side panel unmounts when it closes, and these used to be that panel's own state.
describe('chatStore — the turn meters', () => {
  const openThread = (id: string): void => {
    useChatStore.getState().reset();
    useChatStore
      .getState()
      .addMessage(id, { id: 'm1', role: 'user', parts: [] });
  };

  it('keeps the clock and the count on the session, where no unmount reaches them', () => {
    openThread('sess-blink');
    useChatStore.getState().startTurnMeters('sess-blink');
    useChatStore.getState().recordUsage('sess-blink', 30_000);
    useChatStore.getState().recordUsage('sess-blink', 30_450);

    // What a remounted panel reads back.
    const thread = useChatStore.getState().threads['sess-blink'];
    expect(thread?.usedTokens).toBe(450);
    expect(thread?.turnStartedAt).toBeTypeOf('number');
  });

  // The engine reports the whole context, so the turn's first reading is the zero of this question.
  it('counts each question from its own first reading', () => {
    openThread('sess-blink');
    useChatStore.getState().startTurnMeters('sess-blink');
    useChatStore.getState().recordUsage('sess-blink', 12_000);
    expect(useChatStore.getState().threads['sess-blink']?.usedTokens).toBe(0);

    useChatStore.getState().startTurnMeters('sess-blink');
    useChatStore.getState().recordUsage('sess-blink', 18_000);
    expect(useChatStore.getState().threads['sess-blink']?.usedTokens).toBe(0);
    useChatStore.getState().recordUsage('sess-blink', 19_500);
    expect(useChatStore.getState().threads['sess-blink']?.usedTokens).toBe(
      1_500,
    );
  });

  // A background turn's usage belongs to its own session, not to whichever one is on screen.
  it("puts a session's usage on its own thread", () => {
    openThread('sess-a');
    useChatStore
      .getState()
      .addMessage('sess-b', { id: 'm1', role: 'user', parts: [] });
    useChatStore.getState().startTurnMeters('sess-a');
    useChatStore.getState().startTurnMeters('sess-b');

    useChatStore.getState().recordUsage('sess-a', 1_000);
    useChatStore.getState().recordUsage('sess-a', 1_200);
    useChatStore.getState().recordUsage('sess-b', 5_000);

    const { threads } = useChatStore.getState();
    expect(threads['sess-a']?.usedTokens).toBe(200);
    expect(threads['sess-b']?.usedTokens).toBe(0);
  });
});
