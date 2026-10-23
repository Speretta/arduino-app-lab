import { create } from 'zustand';

import {
  Checklist,
  ChoiceRequest,
  onWorkspaceAppForgotten,
  PermissionRequest,
  SessionSummary,
  ToolCall,
  ToolCallStatus,
  Unsubscribe,
} from '../services';

// A cross-tree request to switch the chat's active session. The side panel writes it; ChatPanel.logic
// (the single owner of the session lifecycle) reacts, runs reopen/newChat, then clears it. `nonce`
// makes each request distinct so re-clicking "New chat" (or reopening the same session) re-fires.
export type SessionRequest =
  | { type: 'open'; session: SessionSummary; nonce: number }
  // `workspace` moves the panel as it opens the chat — the host sends it when the app it was on is gone.
  | { type: 'new'; workspace?: { id: string; name?: string }; nonce: number };

// Rendered projection of content AgentUpdates: text/thinking accumulate deltas, tool_call/checklist/choices hold a snapshot; inline markdown (code/table/diff) lives inside `text`, not here.
export type MessagePart =
  | { type: 'text'; id: string; text: string }
  | { type: 'tool_call'; toolCall: ToolCall }
  | {
      type: 'thinking';
      id: string;
      text: string;
      startedAt?: number; // epoch ms of the first delta, for the "Thought for Xs" duration
      endedAt?: number; // epoch ms of the last delta
    }
  | { type: 'checklist'; id: string; checklist: Checklist }
  | { type: 'choices'; id: string; choices: ChoiceRequest }
  | {
      type: 'choice-answer';
      id: string;
      question: string;
      answer: string;
      skipped?: boolean;
    };

export interface ChoiceEcho {
  question: string;
  answer: string;
  skipped?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  parts: MessagePart[];
  status?: 'typing' | 'complete' | 'error';
  error?: string;
  errorKind?: string; // ACP errorKind (e.g. rate_limit) — lets the error UI differentiate
  cancelled?: boolean; // the user stopped this turn
}

interface ToolCallPatch {
  status: ToolCallStatus;
  input?: unknown;
  output?: string;
}

// Per-session chat state: each session keeps its own thread so a turn that streams while another session is
// open (a background turn) keeps building correctly, and switching sessions just displays a different thread.
interface Thread {
  messages: ChatMessage[];
  streamingMessageId?: string; // assistant message currently being appended to (this session's live turn)
  pendingPermission?: PermissionRequest;
  resolvedChoiceIds?: string[]; // choice questions already answered/skipped/closed — hidden on redisplay so they don't re-prompt after a reopen
  // The turn's meters live here, not in the panel: the editor's side panel unmounts when it closes.
  turnStartedAt?: number; // epoch ms, so the elapsed time is derived and survives a remount exactly
  usedTokens?: number; // this turn's growth, already net of the baseline below
  tokenBaseline?: number; // the turn's first reading: the engine reports the whole context
}

interface ChatStore {
  currentSessionId: string | null; // the session shown in the panel; the UI reads threads[currentSessionId]
  threads: Record<string, Thread>;
  // The session to reopen on the panel's next mount, so navigating away (e.g. to My Apps) and back
  // resumes it; its title rides along to restore the header.
  lastSessionId: string | null;
  lastSessionTitle?: string;
  // Its workspace rides along too: a remount resumes through bootstrap, which has no session summary to read it from.
  lastSessionWorkspaceId?: string;
  lastSessionWorkspaceName?: string;
  // Per workspace, the session that was open in it, so switching away and back lands where the user left off; forgotten on restart like every field here.
  lastSessionByWorkspace: Record<string, { id: string; title?: string }>;
  // Per-session in-flight-turn flag; the UI's `isStreaming` is derived from the current session's entry.
  streamingSessions: Record<string, boolean>;
  // Sessions whose turn finished while the user was viewing another session — a reply is waiting
  // (the sidebar's "reply ready" dot). Cleared once the user opens the session.
  replyReadySessions: Record<string, boolean>;

  // Pending session switch requested from the side panel; consumed and cleared by ChatPanel.logic.
  sessionRequest?: SessionRequest;

  // A session created by "New Session" that hasn't received a prompt yet. The agent only lists a
  // session once it has content, so this one has no sidebar row of its own — the side panel keeps
  // the "New Session" entry selected instead, until the first prompt promotes it to a real row.
  draftSessionId: string | null;

  // Which mounted ChatPanel drives the agent: two can be mounted at once, and both subscribing put every update in the thread twice.
  chatOwners: ChatOwner[];
  claimChat: (ownerId: string, onScreen: boolean) => void;
  releaseChat: (ownerId: string) => void;
  // App Lab hides the surface it is not showing instead of unmounting it, so each panel needs telling.
  agentModeActive: boolean;
  setAgentModeActive: (active: boolean) => void;

  setCurrentSessionId: (sessionId: string | null) => void;
  setLastSession: (
    sessionId: string | null,
    title?: string,
    workspace?: { id: string; name?: string },
  ) => void;
  // Mark the open session as an unused draft or clear it, and drop a workspace's remembered session once it turns out not to be loadable.
  forgetWorkspaceSession: (workspaceId: string) => void;
  // Drop a deleted session from every workspace that remembered it — the sidebar can delete another workspace's.
  forgetSession: (sessionId: string) => void;
  setDraftSessionId: (sessionId: string | null) => void;
  // Flag a session as having a reply ready (its background turn finished, unseen).
  markReplyReady: (sessionId: string) => void;
  // Ask the chat to open an existing session (from the side panel).
  requestOpenSession: (session: SessionSummary) => void;
  // Ask the chat to start a fresh session (from the side panel).
  requestNewSession: (workspace?: { id: string; name?: string }) => void;
  // Consume the pending request (called by ChatPanel.logic after acting on it).
  clearSessionRequest: VoidFunction;
  addMessage: (sessionId: string, message: ChatMessage) => void;
  appendText: (sessionId: string, messageId: string, delta: string) => void;
  addToolCall: (
    sessionId: string,
    messageId: string,
    toolCall: ToolCall,
  ) => void;
  upsertChecklist: (
    sessionId: string,
    messageId: string,
    checklist: Checklist,
  ) => void;
  upsertChoices: (
    sessionId: string,
    messageId: string,
    choices: ChoiceRequest,
  ) => void;
  appendThinking: (sessionId: string, messageId: string, delta: string) => void;
  updateToolCall: (
    sessionId: string,
    messageId: string,
    toolCallId: string,
    patch: ToolCallPatch,
  ) => void;
  setMessageStatus: (
    sessionId: string,
    messageId: string,
    status: 'typing' | 'complete',
  ) => void;
  setMessageError: (
    sessionId: string,
    messageId: string,
    error: string,
    kind?: string,
  ) => void;
  setMessageCancelled: (sessionId: string, messageId: string) => void;
  removeMessage: (sessionId: string, messageId: string) => void;
  setStreamingMessageId: (
    sessionId: string,
    messageId: string | undefined,
  ) => void;
  setPendingPermission: (
    sessionId: string,
    request?: PermissionRequest,
  ) => void;
  // Mark a choice question resolved (answered/skipped/closed) so it stops rendering as an active prompt.
  resolveChoice: (sessionId: string, choiceId: string) => void;
  setSessionStreaming: (sessionId: string, streaming: boolean) => void;
  // Starts this session's turn meters: the clock from now, the token count from its next reading.
  startTurnMeters: (sessionId: string) => void;
  // One usage_update: the first of a turn sets the baseline, so each question counts from zero.
  recordUsage: (sessionId: string, usedTokens: number) => void;
  // Empty a session's thread (before a cold reload replays its history).
  resetThread: (sessionId: string) => void;
  // Drop a session entirely (on delete).
  discardThread: (sessionId: string) => void;
  // Wipe every session on sign-out: the next sign-in respawns the agent with none of them loaded, and
  // a leftover thread would make bootstrap skip the loadSession replay and prompt a dead session id.
  reset: VoidFunction;
  // Same hazard as `reset`, for a crashed-out agent: the replacement process has none of these sessions
  // loaded. Keeps the session to reopen so a reconnect lands back in the same chat, replayed from disk —
  // unless it was an unprompted draft, which the agent never persisted and so cannot replay.
  resetLoadedSessions: VoidFunction;
}

const emptyThread = (): Thread => ({ messages: [] });

// Every non-action field, so `reset` restores the just-loaded state in one spread.
const initialState = {
  currentSessionId: null,
  threads: {},
  streamingSessions: {},
  replyReadySessions: {},
  sessionRequest: undefined,
  draftSessionId: null,
  lastSessionId: null,
  lastSessionTitle: undefined,
  lastSessionWorkspaceId: undefined,
  lastSessionWorkspaceName: undefined,
  lastSessionByWorkspace: {},
};

interface ChatOwner {
  id: string;
  onScreen: boolean;
}

// The panel on screen drives; with none on screen the last mounted one keeps watching, so recency only breaks ties and a hidden remount can't steal the stream.
export const chatDriver = (owners: ChatOwner[]): string | undefined => {
  const onScreen = owners.filter((owner) => owner.onScreen);
  const pool = onScreen.length > 0 ? onScreen : owners;
  return pool[pool.length - 1]?.id;
};

const mapMessage = (
  messages: ChatMessage[],
  messageId: string,
  update: (message: ChatMessage) => ChatMessage,
): ChatMessage[] =>
  messages.map((message) =>
    message.id === messageId ? update(message) : message,
  );

export const useChatStore = create<ChatStore>((set) => {
  // Immutably update one session's thread, but never create it: a turn settling after
  // resetLoadedSessions (its Go epilogue outlives the teardown) would otherwise leave an empty thread
  // behind, which bootstrap reads as a loaded session and skips the replay for. Only addMessage starts one.
  const patchThread = (
    sessionId: string,
    fn: (thread: Thread) => Thread,
  ): void =>
    set((state) => {
      const thread = state.threads[sessionId];
      return thread
        ? { threads: { ...state.threads, [sessionId]: fn(thread) } }
        : state;
    });
  const patchMessages = (
    sessionId: string,
    fn: (messages: ChatMessage[]) => ChatMessage[],
  ): void =>
    patchThread(sessionId, (t) => ({ ...t, messages: fn(t.messages) }));

  return {
    ...initialState,

    chatOwners: [],
    claimChat: (ownerId, onScreen): void =>
      set((state) => ({
        chatOwners: [
          ...state.chatOwners.filter((o) => o.id !== ownerId),
          { id: ownerId, onScreen },
        ],
      })),
    releaseChat: (ownerId): void =>
      set((state) => ({
        chatOwners: state.chatOwners.filter((o) => o.id !== ownerId),
      })),

    agentModeActive: false,
    setAgentModeActive: (agentModeActive): void => set({ agentModeActive }),

    setDraftSessionId: (draftSessionId): void => set({ draftSessionId }),

    setLastSession: (lastSessionId, lastSessionTitle, workspace): void =>
      set((state) => ({
        lastSessionId,
        lastSessionTitle,
        lastSessionWorkspaceId: workspace?.id,
        lastSessionWorkspaceName: workspace?.name,
        // The overall last session drives a remount; this map drives a workspace switch, which must not resurrect a chat open elsewhere.
        lastSessionByWorkspace:
          workspace && lastSessionId
            ? {
                ...state.lastSessionByWorkspace,
                [workspace.id]: { id: lastSessionId, title: lastSessionTitle },
              }
            : state.lastSessionByWorkspace,
      })),

    forgetWorkspaceSession: (workspaceId): void =>
      set((state) => {
        const next = { ...state.lastSessionByWorkspace };
        delete next[workspaceId];
        return { lastSessionByWorkspace: next };
      }),

    forgetSession: (sessionId): void =>
      set((state) => ({
        lastSessionByWorkspace: Object.fromEntries(
          Object.entries(state.lastSessionByWorkspace).filter(
            ([, last]) => last.id !== sessionId,
          ),
        ),
      })),

    setCurrentSessionId: (currentSessionId): void =>
      // Opening a session clears its "reply ready" dot — the user is now looking at it.
      set((state) => {
        if (!currentSessionId || !state.replyReadySessions[currentSessionId]) {
          return { currentSessionId };
        }
        const replyReadySessions = { ...state.replyReadySessions };
        delete replyReadySessions[currentSessionId];
        return { currentSessionId, replyReadySessions };
      }),

    markReplyReady: (sessionId): void =>
      set((state) =>
        state.replyReadySessions[sessionId]
          ? state
          : {
              replyReadySessions: {
                ...state.replyReadySessions,
                [sessionId]: true,
              },
            },
      ),

    requestOpenSession: (session): void =>
      set((state) => ({
        sessionRequest: {
          type: 'open',
          session,
          nonce: (state.sessionRequest?.nonce ?? 0) + 1,
        },
      })),
    requestNewSession: (workspace): void =>
      set((state) => ({
        sessionRequest: {
          type: 'new',
          workspace,
          nonce: (state.sessionRequest?.nonce ?? 0) + 1,
        },
      })),
    clearSessionRequest: (): void => set({ sessionRequest: undefined }),

    // The one action that starts a thread (first prompt of a session, or its replay).
    addMessage: (sessionId, message): void =>
      set((state) => {
        const thread = state.threads[sessionId] ?? emptyThread();
        return {
          threads: {
            ...state.threads,
            [sessionId]: { ...thread, messages: [...thread.messages, message] },
          },
        };
      }),

    appendText: (sessionId, messageId, delta): void =>
      patchMessages(sessionId, (messages) =>
        mapMessage(messages, messageId, (message) => {
          const parts = [...message.parts];
          const last = parts[parts.length - 1];
          if (last && last.type === 'text') {
            // The Claude ACP adapter re-sends the whole text block as one consolidated chunk after the deltas; drop the repeat.
            if (delta === last.text) {
              return message;
            }
            parts[parts.length - 1] = { ...last, text: last.text + delta };
          } else {
            parts.push({
              type: 'text',
              id: `${messageId}-t${parts.length}`,
              text: delta,
            });
          }
          return { ...message, parts };
        }),
      ),

    addToolCall: (sessionId, messageId, toolCall): void =>
      patchMessages(sessionId, (messages) =>
        mapMessage(messages, messageId, (message) => ({
          ...message,
          parts: [...message.parts, { type: 'tool_call', toolCall }],
        })),
      ),

    appendThinking: (sessionId, messageId, delta): void =>
      patchMessages(sessionId, (messages) =>
        mapMessage(messages, messageId, (message) => {
          const parts = [...message.parts];
          const last = parts[parts.length - 1];
          const now = Date.now();
          if (last && last.type === 'thinking') {
            // Same consolidated-block re-send guard as appendText.
            if (delta === last.text) {
              return message;
            }
            parts[parts.length - 1] = {
              ...last,
              text: last.text + delta,
              endedAt: now,
            };
          } else {
            parts.push({
              type: 'thinking',
              id: `${messageId}-th${parts.length}`,
              text: delta,
              startedAt: now,
              endedAt: now,
            });
          }
          return { ...message, parts };
        }),
      ),

    upsertChecklist: (sessionId, messageId, checklist): void =>
      patchMessages(sessionId, (messages) =>
        mapMessage(messages, messageId, (message) => {
          const partId = `${messageId}-cl-${checklist.id}`;
          const exists = message.parts.some(
            (part) => part.type === 'checklist' && part.id === partId,
          );
          if (exists) {
            return {
              ...message,
              parts: message.parts.map((part) =>
                part.type === 'checklist' && part.id === partId
                  ? { type: 'checklist', id: partId, checklist }
                  : part,
              ),
            };
          }
          return {
            ...message,
            parts: [
              ...message.parts,
              { type: 'checklist', id: partId, checklist },
            ],
          };
        }),
      ),

    upsertChoices: (sessionId, messageId, choices): void =>
      patchMessages(sessionId, (messages) =>
        mapMessage(messages, messageId, (message) => {
          const partId = `${messageId}-ch-${choices.id}`;
          const exists = message.parts.some(
            (part) => part.type === 'choices' && part.id === partId,
          );
          if (exists) {
            return {
              ...message,
              parts: message.parts.map((part) =>
                part.type === 'choices' && part.id === partId
                  ? { type: 'choices', id: partId, choices }
                  : part,
              ),
            };
          }
          return {
            ...message,
            parts: [...message.parts, { type: 'choices', id: partId, choices }],
          };
        }),
      ),

    updateToolCall: (sessionId, messageId, toolCallId, patch): void =>
      patchMessages(sessionId, (messages) =>
        mapMessage(messages, messageId, (message) => ({
          ...message,
          parts: message.parts.map((part) =>
            part.type === 'tool_call' && part.toolCall.id === toolCallId
              ? { type: 'tool_call', toolCall: { ...part.toolCall, ...patch } }
              : part,
          ),
        })),
      ),

    setMessageStatus: (sessionId, messageId, status): void =>
      patchMessages(sessionId, (messages) =>
        mapMessage(messages, messageId, (message) => ({ ...message, status })),
      ),

    setMessageError: (sessionId, messageId, error, kind): void =>
      patchMessages(sessionId, (messages) =>
        mapMessage(messages, messageId, (message) => ({
          ...message,
          status: 'error',
          error,
          errorKind: kind,
        })),
      ),

    setMessageCancelled: (sessionId, messageId): void =>
      patchMessages(sessionId, (messages) =>
        mapMessage(messages, messageId, (message) => ({
          ...message,
          cancelled: true,
        })),
      ),

    removeMessage: (sessionId, messageId): void =>
      patchMessages(sessionId, (messages) =>
        messages.filter((m) => m.id !== messageId),
      ),

    setStreamingMessageId: (sessionId, streamingMessageId): void =>
      patchThread(sessionId, (t) => ({ ...t, streamingMessageId })),

    setPendingPermission: (sessionId, pendingPermission): void =>
      patchThread(sessionId, (t) => ({ ...t, pendingPermission })),

    resolveChoice: (sessionId, choiceId): void =>
      patchThread(sessionId, (t) => ({
        ...t,
        resolvedChoiceIds: t.resolvedChoiceIds?.includes(choiceId)
          ? t.resolvedChoiceIds
          : [...(t.resolvedChoiceIds ?? []), choiceId],
      })),

    // Seeds the thread where patchThread would not: every later reading of this turn needs it to exist.
    startTurnMeters: (sessionId): void =>
      set((state) => ({
        threads: {
          ...state.threads,
          [sessionId]: {
            ...(state.threads[sessionId] ?? emptyThread()),
            turnStartedAt: Date.now(),
            usedTokens: 0,
            tokenBaseline: undefined,
          },
        },
      })),

    recordUsage: (sessionId, usedTokens): void =>
      patchThread(sessionId, (t) => {
        const tokenBaseline = t.tokenBaseline ?? usedTokens;
        return {
          ...t,
          tokenBaseline,
          usedTokens: Math.max(0, usedTokens - tokenBaseline),
        };
      }),

    setSessionStreaming: (sessionId, streaming): void =>
      set((state) => {
        const next = { ...state.streamingSessions };
        if (streaming) {
          next[sessionId] = true;
        } else {
          delete next[sessionId];
        }
        return { streamingSessions: next };
      }),

    resetThread: (sessionId): void =>
      set((state) => ({
        threads: { ...state.threads, [sessionId]: emptyThread() },
      })),

    discardThread: (sessionId): void =>
      set((state) => {
        const threads = { ...state.threads };
        delete threads[sessionId];
        const streamingSessions = { ...state.streamingSessions };
        delete streamingSessions[sessionId];
        const replyReadySessions = { ...state.replyReadySessions };
        delete replyReadySessions[sessionId];
        return { threads, streamingSessions, replyReadySessions };
      }),

    reset: (): void => set({ ...initialState }),

    resetLoadedSessions: (): void =>
      set((state) => {
        const wasDraft =
          !!state.lastSessionId && state.lastSessionId === state.draftSessionId;
        return {
          ...initialState,
          lastSessionId: wasDraft ? null : state.lastSessionId,
          lastSessionTitle: wasDraft ? undefined : state.lastSessionTitle,
          lastSessionWorkspaceId: wasDraft
            ? undefined
            : state.lastSessionWorkspaceId,
          lastSessionWorkspaceName: wasDraft
            ? undefined
            : state.lastSessionWorkspaceName,
          // The surviving session keeps its place in the per-workspace map too, or that workspace opens an empty chat after an agent restart.
          lastSessionByWorkspace:
            wasDraft || !state.lastSessionId
              ? {}
              : {
                  [state.lastSessionWorkspaceId ?? '']: {
                    id: state.lastSessionId,
                    title: state.lastSessionTitle,
                  },
                },
        };
      }),
  };
});

// Whether any session has a turn in flight, across every session (not just the one on screen). The host reads it
// before actions that would kill that turn — switching board tears the agent down — to warn first.
export const agentIsBusy = (): boolean =>
  Object.values(useChatStore.getState().streamingSessions).some(Boolean);

// An app is gone: its chats went with it, so the workspace must stop offering one and any panel there has to move off.
const forgetWorkspaceApp = (appId: string): void => {
  const store = useChatStore.getState();
  store.forgetWorkspaceSession(appId);
  if (store.lastSessionWorkspaceId === appId) {
    store.setLastSession(null); // a panel opened later must not resume a chat the app took with it
    store.requestNewSession({ id: '' }); // and one already open moves back to the whole board
  }
};

// Watches the host for deleted apps. Started once at startup, right after the service is bound, rather than
// from a panel: the pointer to a deleted app's chat has to be dropped whether or not any chat UI is mounted.
export const subscribeWorkspaceAppForgotten = (): Unsubscribe =>
  onWorkspaceAppForgotten(forgetWorkspaceApp);
