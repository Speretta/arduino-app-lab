import type { AgentEditorContext } from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { MessageDescriptor } from 'react-intl';

import { messages } from '../../../messages';
import {
  AgentMode,
  AgentModel,
  cancel,
  choicesReply,
  ChoiceSubmission,
  closeSession,
  getSessionState,
  isAuthError,
  isNetworkError,
  listSessions,
  loadSession,
  newSession,
  onPermission,
  onUpdate,
  openAgentFile,
  parseAgentError,
  PermissionOption,
  PermissionOptionKind,
  PermissionOutcome,
  permissionReply,
  PermissionRequest,
  prompt,
  SessionId,
  SessionSummary,
  setSessionMode,
  setSessionModel,
} from '../../../services';
import {
  chatDriver,
  ChatMessage,
  ChoiceEcho,
  SessionActionError,
  useAiAssistantStore,
  useChatStore,
} from '../../../store';
import {
  type PromptActionRole,
  formatToolTitle,
  webToolLabel,
} from '../../../ui';
import { isOffline } from '../../../utils';

// Advanced permission-mode options the ExitPlanMode approval over-exposes; Claude Code surfaces a single "Yes, and …", so we hide these for a clean plan-approval.
const PLAN_ADVANCED_OPTION_IDS = new Set([
  'exit-plan-bypass',
  'exit-plan-clear-bypass',
  'exit-plan-auto',
  'exit-plan-clear-auto',
]);

let idCounter = 0;
const nextId = (): string => `msg-${(idCounter += 1)}`;

// Stable empty array so the messages selector returns the same reference when a session has no thread yet.
const EMPTY_MESSAGES: ChatMessage[] = [];

// One button of the permission prompt. `label` is the agent's own text, set only when ours would
// collide; the caller renders it in preference to formatting `labelMessage`.
export interface PermissionAction {
  id: string;
  label?: string;
  labelMessage: MessageDescriptor;
  role: PromptActionRole;
}

// Everything the permission prompt displays, resolved from the request in one place.
export interface PermissionView {
  // Plan-mode approval: the card is reframed and the plan itself renders in the thread, so no command.
  planApproval: boolean;
  command?: string;
  reason?: string;
  // The call writes into another app: the host resolved it, so the badge and the refusal to auto-approve agree.
  outsideWorkspace: boolean;
  actions: PermissionAction[];
}

// The failure of the last turn, shown in the composer next to the permission and choices cards
// rather than in the thread: it asks the user for a decision (retry, or move on) about what to do
// next, which is the composer's job, and it isn't part of the transcript.
export interface RequestErrorView {
  messageId: string;
  // The agent's own words. Absent when the failure happened before it was reached at all (offline),
  // where `kind` is what the view speaks from.
  message?: string;
  // 'network' when the request never reached the provider, so the view explains it in its own
  // (localized) words instead of showing a raw transport error.
  kind?: string;
}

export interface ChatPanelLogic {
  messages: ChatMessage[];
  isStreaming: boolean;
  usedTokens: number; // live token count for the current turn (ACP usage_update)
  turnStartedAt?: number; // epoch ms the current turn started, for the elapsed-time counter
  permission?: PermissionView; // the permission/plan approval the turn is waiting on, ready to render
  requestError?: RequestErrorView; // the last turn's failure, ready to render
  // Why the session couldn't be opened (agent down, ACP handshake refused, a session the agent no
  // longer has…). Without it a failed bootstrap leaves an empty thread and no session id — which
  // renders as a fresh install, composer included.
  bootstrapError?: string;
  retryBootstrap: VoidFunction;
  models: AgentModel[];
  currentModelId?: string;
  setModel: (modelId: string) => Promise<void>;
  modes: AgentMode[];
  currentModeId?: string;
  setMode: (modeId: string) => Promise<void>;
  send: (text: string) => Promise<void>;
  stop: () => Promise<void>;
  retry: (assistantMessageId: string) => Promise<void>;
  respondPermission: (outcome: PermissionOutcome) => void;
  respondChoices: (
    requestId: string,
    submission: ChoiceSubmission,
    echo?: ChoiceEcho,
  ) => void;
  sessionTitle?: string;
  isLoadingSession: boolean;
  // No messages and nothing loading: the panel shows the centred empty state.
  isNewSession: boolean;
  // The workspace the next session opens in ('' = general), and the picker's action.
  workspaceId: string;
  // Set only when the current session's app is missing from the picker's list, so it can still be named.
  workspaceName?: string;
  selectWorkspace: (id: string, name?: string) => void;
  reopen: (session: SessionSummary) => void;
  newChat: VoidFunction;
  currentSessionId: SessionId | null;
  // Open a file the agent touched; rejects (→ fileError) when the path is stale, e.g. board changed.
  openFile: (path: string) => void;
  fileError?: string;
  dismissFileError: VoidFunction;
  // A session rename/pin/delete the side panel couldn't apply; reported here, as the sidebar has no
  // toast layer of its own.
  sessionActionError?: MessageDescriptor;
  dismissSessionActionError: VoidFunction;
}

const actionErrorMessages: Record<SessionActionError, MessageDescriptor> = {
  rename: messages.sessionsRenameFailed,
  pin: messages.sessionsPinFailed,
  delete: messages.sessionsDeleteFailed,
};

const asString = (v: unknown): string =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : '';

// What a tool acts on (app name, brick, library…), pulled from its arguments, so the dialog reads
// "Start app: Blink Demo" instead of a bare "Start app". `_targetName` is the app's display name resolved
// by the backend (falls back to the raw id when unavailable). Empty for tools with no such target.
const permissionTarget = (input: unknown): string => {
  if (!input || typeof input !== 'object') {
    return '';
  }
  const o = input as Record<string, unknown>;
  const primary =
    asString(o._targetName) ||
    asString(o.id) ||
    asString(o.appID) ||
    asString(o.name);
  const detail = asString(o.brickID) || asString(o.library);
  return primary && detail ? `${primary} · ${detail}` : primary || detail;
};

// What the permission is about: Bash/exec tools carry the command in rawInput.command; otherwise show the
// tool label plus its target (the app/example it acts on), so "Start app" is never shown without context.
const permissionCommand = (toolCall: {
  title: string;
  kind?: string;
  input?: unknown;
}): string => {
  const input = toolCall.input;
  // Web search/fetch read as an action, not a shell command (e.g. "Search the web: nano r4").
  const web = webToolLabel(toolCall.kind, input);
  if (web) {
    return web;
  }

  if (
    input &&
    typeof input === 'object' &&
    'command' in input &&
    typeof (input as { command: unknown }).command === 'string'
  ) {
    return (input as { command: string }).command;
  }

  const label = formatToolTitle(toolCall.title);
  const target = permissionTarget(input);
  return target ? `${label}: ${target}` : label;
};

// The board_exec `reason` arg, shown beneath the command so the user sees why it's being run.
const permissionReason = (toolCall: { input?: unknown }): string => {
  const input = toolCall.input;
  if (
    input &&
    typeof input === 'object' &&
    'reason' in input &&
    typeof (input as { reason: unknown }).reason === 'string'
  ) {
    return (input as { reason: string }).reason;
  }

  return '';
};

// The plan-mode approval (ExitPlanMode, ACP kind "switch_mode"): reframed as a plan-approval, not a raw permission prompt (the plan renders as a persistent block in the thread).
const isPlanApproval = (request?: PermissionRequest): boolean =>
  request?.toolCall?.kind === 'switch_mode';

// The options to show for a permission request; board_exec's "always" options are already dropped in Go (toPermissionRequest), so only the plan approval filters here: it hides the advanced permission-mode options to read as a clean plan-approval.
const visiblePermissionOptions = (
  request?: PermissionRequest,
): PermissionOption[] => {
  if (!request) {
    return [];
  }

  if (isPlanApproval(request)) {
    return request.options.filter((o) => !PLAN_ADVANCED_OPTION_IDS.has(o.id));
  }

  return request.options;
};

// Several options sharing a kind (plan mode) would collide under our concise by-kind labels, so the caller falls back to the agent's own labels when kinds repeat.
const hasDuplicatePermissionKinds = (options: PermissionOption[]): boolean =>
  new Set(options.map((o) => o.kind)).size !== options.length;

// Our own concise label per option kind — the agent's option.label repeats the whole command.
const permissionActionLabel = (
  kind: PermissionOptionKind,
): MessageDescriptor => {
  if (kind === 'allow_always') {
    return messages.permAllowAlways;
  }

  if (kind.startsWith('reject')) {
    return messages.permReject;
  }

  return messages.permAllowOnce;
};

const permissionActionRole = (kind: PermissionOptionKind): PromptActionRole => {
  if (kind.startsWith('reject')) {
    return 'cancel';
  }

  if (kind === 'allow_once') {
    return 'primary';
  }

  return 'secondary';
};

export const permissionView = (request: PermissionRequest): PermissionView => {
  const planApproval = isPlanApproval(request);
  const options = visiblePermissionOptions(request);
  // Concise by-kind labels normally; when several options share a kind (plan mode) they would collide,
  // so those actions carry the agent's own label instead.
  const agentLabels = planApproval || hasDuplicatePermissionKinds(options);
  const toolCall = planApproval ? undefined : request.toolCall;

  return {
    planApproval,
    outsideWorkspace: !!toolCall?.outsideWorkspace,
    command: toolCall && permissionCommand(toolCall),
    reason: (toolCall && permissionReason(toolCall)) || undefined,
    actions: options.map((option) => ({
      id: option.id,
      label: agentLabels ? option.label : undefined,
      labelMessage: permissionActionLabel(option.kind),
      role: permissionActionRole(option.kind),
    })),
  };
};

// Grow-only merge: refresh existing models' metadata, append new ones, never remove — a cold/transient re-read only ADDS.
const mergeModels = (prev: AgentModel[], next: AgentModel[]): AgentModel[] => {
  const byId = new Map(next.map((m) => [m.id, m]));
  const seen = new Set(prev.map((m) => m.id));
  const merged = prev.map((m) => byId.get(m.id) ?? m);
  for (const m of next) {
    if (!seen.has(m.id)) {
      merged.push(m);
    }
  }
  return merged;
};

// lockedWorkspaceId binds the panel to one app (the editor's side panel): no picking, no resuming from elsewhere. onScreen says whether it is the panel being shown — see chatDriver.
export const useChatLogic = (
  lockedWorkspaceId?: string,
  lockedWorkspaceName?: string,
  onScreen = true,
  getEditorContext?: () => AgentEditorContext,
): ChatPanelLogic => {
  const getEditorContextRef = useRef(getEditorContext);
  getEditorContextRef.current = getEditorContext;
  // The panel displays its OWN session: until it adopts one the shared pointer still names the chat shown before, and that thread would appear here.
  const [ownSessionId, setOwnSessionId] = useState<SessionId | null>(null);
  const messages = useChatStore(
    (s) =>
      (ownSessionId ? s.threads[ownSessionId]?.messages : undefined) ??
      EMPTY_MESSAGES,
  );
  const isStreaming = useChatStore((s) =>
    ownSessionId ? !!s.streamingSessions[ownSessionId] : false,
  );
  const pendingPermission = useChatStore((s) =>
    ownSessionId ? s.threads[ownSessionId]?.pendingPermission : undefined,
  );
  // On the thread, so closing the side panel no longer takes the turn's counter and clock with it.
  const usedTokens = useChatStore((s) =>
    ownSessionId ? s.threads[ownSessionId]?.usedTokens ?? 0 : 0,
  );
  const turnStartedAt = useChatStore((s) =>
    ownSessionId ? s.threads[ownSessionId]?.turnStartedAt : undefined,
  );
  const ownerId = useId();
  const claimChat = useChatStore((s) => s.claimChat);
  const releaseChat = useChatStore((s) => s.releaseChat);
  const isActive = useChatStore((s) => chatDriver(s.chatOwners) === ownerId);
  // Read at event time, not from a render-synced ref: a hand-over must not leave a gap where neither panel takes it.
  const isDriving = useCallback(
    (): boolean => chatDriver(useChatStore.getState().chatOwners) === ownerId,
    [ownerId],
  );

  useEffect(() => {
    claimChat(ownerId, onScreen);
    return () => releaseChat(ownerId);
  }, [ownerId, onScreen, claimChat, releaseChat]);

  const setCurrentSessionId = useChatStore((s) => s.setCurrentSessionId);
  const setLastSession = useChatStore((s) => s.setLastSession);
  const forgetWorkspaceSession = useChatStore((s) => s.forgetWorkspaceSession);
  const forgetSession = useChatStore((s) => s.forgetSession);
  const setDraftSessionId = useChatStore((s) => s.setDraftSessionId);
  const addMessage = useChatStore((s) => s.addMessage);
  const appendText = useChatStore((s) => s.appendText);
  const addToolCall = useChatStore((s) => s.addToolCall);
  const appendThinking = useChatStore((s) => s.appendThinking);
  const upsertChecklist = useChatStore((s) => s.upsertChecklist);
  const upsertChoices = useChatStore((s) => s.upsertChoices);
  const updateToolCall = useChatStore((s) => s.updateToolCall);
  const setMessageStatus = useChatStore((s) => s.setMessageStatus);
  const setMessageError = useChatStore((s) => s.setMessageError);
  const setMessageCancelled = useChatStore((s) => s.setMessageCancelled);
  const removeMessage = useChatStore((s) => s.removeMessage);
  const setStreamingMessageId = useChatStore((s) => s.setStreamingMessageId);
  const setSessionStreaming = useChatStore((s) => s.setSessionStreaming);
  const startTurnMeters = useChatStore((s) => s.startTurnMeters);
  const recordUsage = useChatStore((s) => s.recordUsage);
  const markReplyReady = useChatStore((s) => s.markReplyReady);
  const setPendingPermission = useChatStore((s) => s.setPendingPermission);
  const resetThread = useChatStore((s) => s.resetThread);
  const sessionRequest = useChatStore((s) => s.sessionRequest);
  const clearSessionRequest = useChatStore((s) => s.clearSessionRequest);
  // Set by the side panel when a session mutation is rejected; shown in this panel's toast area.
  const sessionActionError = useAiAssistantStore((s) => s.sessionActionError);
  const setSessionActionError = useAiAssistantStore(
    (s) => s.setSessionActionError,
  );
  const setAuth = useAiAssistantStore((s) => s.setAuth);
  const setSessionExpired = useAiAssistantStore((s) => s.setSessionExpired);
  const setPickers = useAiAssistantStore((s) => s.setPickers);

  // refs: subscriptions are set up per mount but must target the current session/turn
  const sessionIdRef = useRef<SessionId | null>(null);
  // Bumped on every (re)bootstrap so an in-flight new/load bails if superseded or unmounted.
  const bootstrapToken = useRef(0);
  // The workspace the held session belongs to: a hidden panel can be rebound to another app before it is shown again.
  const sessionWorkspaceRef = useRef('');

  // Pickers: the agent advertises models + modes per session (read after newSession). Seed from the
  // last session's cache so the toolbar renders the pickers immediately instead of popping in (and
  // shifting the layout) once getSessionState resolves; hydratePickers then confirms/updates them.
  const cachedPickers = useAiAssistantStore.getState().pickers;
  const [models, setModels] = useState<AgentModel[]>(
    cachedPickers?.models ?? [],
  );
  const [currentModelId, setCurrentModelId] = useState<string | undefined>(
    cachedPickers?.currentModelId,
  );
  // Latest selected model, read by the delayed refresh below without re-arming its timers.
  const currentModelIdRef = useRef<string | undefined>(currentModelId);
  currentModelIdRef.current = currentModelId;

  // Soon after a session opens, re-select the current model (no-op) so the agent re-advertises the now-warmer catalog cache — surfaces a late-loading Fable 5 without user action.
  useEffect(() => {
    if (!ownSessionId) {
      return;
    }
    const timers = [3000, 12000].map((ms) =>
      setTimeout(() => {
        const modelId = currentModelIdRef.current;
        if (modelId) {
          void setSessionModel(ownSessionId, modelId).catch(() => {
            // best-effort refresh; ignore failures
          });
        }
      }, ms),
    );
    return () => timers.forEach(clearTimeout);
  }, [ownSessionId]);
  const [modes, setModes] = useState<AgentMode[]>(cachedPickers?.modes ?? []);
  const [currentModeId, setCurrentModeId] = useState<string | undefined>(
    cachedPickers?.currentModeId,
  );
  const [sessionTitle, setSessionTitle] = useState<string | undefined>();
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | undefined>();
  // The workspace the NEXT session opens in ('' = general). In a ref too, so bootstrap reads it without taking it as a dependency.
  const [workspaceId, setWorkspaceId] = useState(lockedWorkspaceId ?? '');
  const workspaceIdRef = useRef(lockedWorkspaceId ?? '');
  // Read through a ref: bootstrapResume sits in the subscription effect's deps, which must not tear down on a rebind.
  const lockedWorkspaceIdRef = useRef(lockedWorkspaceId);
  lockedWorkspaceIdRef.current = lockedWorkspaceId;
  // The name is carried, not looked up: it goes into the session's system prompt, and it labels a workspace the board no longer lists.
  const [workspaceName, setWorkspaceName] = useState(lockedWorkspaceName);
  const workspaceNameRef = useRef(lockedWorkspaceName);

  // The only writer of the three: bootstrap reads the refs synchronously, so setting the state and forgetting the ref opens the next session on the previous workspace.
  const setWorkspace = useCallback((id: string, name?: string): void => {
    workspaceIdRef.current = id;
    workspaceNameRef.current = name;
    setWorkspaceId(id);
    setWorkspaceName(name);
  }, []);

  const hydratePickers = useCallback(
    async (id: SessionId, token: number): Promise<void> => {
      const state = await getSessionState(id).catch(() => null);
      if (bootstrapToken.current !== token || !state) {
        return;
      }
      // A session the agent doesn't re-advertise (resumed, or one it no longer holds) answers with no
      // models or modes, and taking that literally empties the toolbar for that session alone. The lists
      // fall back to the last advertised ones: they are the agent's catalog, the same for all its sessions.
      // The selected ids don't fall back. They belong to one session, and the refresh above writes
      // currentModelId back, so a borrowed id would move this session onto another one's model.
      const cached = useAiAssistantStore.getState().pickers;
      const next = {
        models: state.models?.length ? state.models : cached?.models ?? [],
        currentModelId: state.modelId,
        modes: state.modes?.length ? state.modes : cached?.modes ?? [],
        currentModeId: state.modeId,
      };
      setModels(next.models);
      setCurrentModelId(next.currentModelId);
      setModes(next.modes);
      setCurrentModeId(next.currentModeId);
      // Cache for the next open, so the pickers render without a gap. The ids are cached exactly as this
      // state reported them, unset included: the next panel seeds currentModelId from here, and the
      // refresh above would write a kept id to whatever session that panel opens.
      setPickers(next);
    },
    [setPickers],
  );

  // Point the panel at a session: new (no id) or reopen (loadId, with its title); switching is display-only so the left session keeps streaming in its own thread.
  const bootstrap = useCallback(
    async (loadId?: SessionId, title?: string): Promise<void> => {
      const token = ++bootstrapToken.current;
      // Pinned here: a switch that lands mid-flight moves the ref, and the failure below belongs to this workspace.
      const openedFor = workspaceIdRef.current;
      setSessionTitle(title);
      setBootstrapError(undefined);
      try {
        const id =
          loadId ??
          (await newSession(
            workspaceIdRef.current || undefined,
            workspaceNameRef.current,
          ));
        if (bootstrapToken.current !== token) {
          if (!loadId) {
            void closeSession(id); // superseded/unmounted before we adopted the new session
          }
          return;
        }
        // Reopening a not-in-memory session needs a history replay; flag it (in the same tick as the
        // switch) so the panel shows a loader instead of flashing the empty "new chat" state. An empty
        // thread counts as none: a persisted session always has messages, so it is a leftover.
        const needsReplay =
          !!loadId && !useChatStore.getState().threads[id]?.messages.length;
        setIsLoadingSession(needsReplay);
        sessionIdRef.current = id; // set before load so replayed updates are accepted
        setOwnSessionId(id);
        sessionWorkspaceRef.current = workspaceIdRef.current;
        setCurrentSessionId(id); // the shared pointer the sidebar highlights; this panel's own display follows ownSessionId
        // A fresh session has no sidebar row until its first prompt gives it content; flag it so the
        // side panel can keep "New Session" selected in the meantime.
        setDraftSessionId(loadId ? null : id);
        // Remember it so navigating away and back reopens this session, workspace included.
        setLastSession(id, title, {
          id: workspaceIdRef.current,
          name: workspaceNameRef.current,
        });
        if (loadId && !needsReplay) {
          // In-memory reopen: the thread is already built (maybe a background turn still streaming) — just display it.
        } else {
          resetThread(id);
          if (loadId) {
            await loadSession(loadId);
            if (bootstrapToken.current !== token) {
              return;
            }
          }
        }
        await hydratePickers(id, token);
      } catch (e) {
        // A remembered session that no longer loads must not be offered again: drop it so the workspace opens clean next time.
        if (loadId) {
          forgetWorkspaceSession(openedFor);
        }
        // Surface it: with no session id the composer stops rendering its send button, so a silent
        // failure is indistinguishable from a brand-new install.
        if (bootstrapToken.current === token) {
          setBootstrapError(parseAgentError(e).message);
        }
      } finally {
        // Clear the loader only if this bootstrap is still the current one (a newer switch owns it otherwise).
        if (bootstrapToken.current === token) {
          setIsLoadingSession(false);
        }
      }
    },
    [
      resetThread,
      hydratePickers,
      setCurrentSessionId,
      setDraftSessionId,
      setLastSession,
      forgetWorkspaceSession,
    ],
  );

  const reopen = useCallback(
    (session: SessionSummary): void => {
      const workspace = session.workspaceAppId ?? '';
      const locked = lockedWorkspaceIdRef.current;
      if (locked !== undefined && workspace !== locked) {
        return; // a locked panel shows one app's sessions; anything else would rebind it from outside
      }
      // The picker shows the workspace of whatever is on screen, so adopt the reopened session's.
      setWorkspace(workspace, session.workspaceName);
      void bootstrap(session.id, session.title);
    },
    [bootstrap, setWorkspace],
  );
  const newChat = useCallback((): void => {
    void bootstrap();
  }, [bootstrap]);

  // A session's workspace is fixed at creation, so picking another opens a new session; the outgoing one is closed only if it was never used.
  const switchWorkspace = useCallback(
    (id: string, name?: string): void => {
      if (id === workspaceIdRef.current) {
        return;
      }
      setWorkspace(id, name);
      const current = sessionIdRef.current;
      const untouched =
        !useChatStore.getState().threads[current ?? '']?.messages.length;
      // Coming back to a workspace reopens the chat it was left on, so the user finds the situation they left.
      const remembered = useChatStore.getState().lastSessionByWorkspace[id];
      // Close the outgoing session only once its replacement is in place, or a failed bootstrap strands the composer on a dead one.
      void bootstrap(remembered?.id, remembered?.title).then(() => {
        if (current && untouched && sessionIdRef.current !== current) {
          // Its workspace remembered it on creation; closing it here would leave that pointer at a session the agent no longer has.
          forgetSession(current);
          void closeSession(current).catch(() => {
            // best-effort: a session already gone needs no cleanup
          });
        }
      });
    },
    [bootstrap, forgetSession, setWorkspace],
  );

  const selectWorkspace = useCallback(
    (id: string, name?: string): void => {
      if (lockedWorkspaceId === undefined) {
        switchWorkspace(id, name);
      }
    },
    [lockedWorkspaceId, switchWorkspace],
  );

  // Rebinds the panel when the editor navigates to another app; the host loads the name after the id, so a late one is adopted without opening a session.
  useEffect(() => {
    if (lockedWorkspaceId === undefined) {
      return;
    }
    if (lockedWorkspaceId !== workspaceIdRef.current) {
      // A hidden panel only records the rebind: opening a session would move the shared pointer out from under the visible one.
      if (isActive) {
        switchWorkspace(lockedWorkspaceId, lockedWorkspaceName);
      } else {
        setWorkspace(lockedWorkspaceId, lockedWorkspaceName);
      }
    } else if (
      lockedWorkspaceName &&
      lockedWorkspaceName !== workspaceNameRef.current
    ) {
      setWorkspace(lockedWorkspaceId, lockedWorkspaceName);
    }
  }, [
    isActive,
    lockedWorkspaceId,
    lockedWorkspaceName,
    switchWorkspace,
    setWorkspace,
  ]);

  const refreshSessionTitle = useCallback((sessionId: SessionId): void => {
    void listSessions()
      .then((sessions) => {
        if (sessionId !== sessionIdRef.current) {
          return;
        }

        const title = sessions.find((s) => s.id === sessionId)?.title;
        setSessionTitle((prev) => (title && title !== prev ? title : prev));
      })
      .catch(() => {
        // best-effort: leave the title as-is on failure
      });
  }, []);

  // On (re)mount: reopen the session the user was in before navigating away this run; start fresh only on
  // the first open, after an app restart, or after a sign-out (all leave lastSessionId unset). Keeps the
  // current chat when toggling between Agent and other App Lab pages, without resuming it on a cold open.
  const bootstrapResume = useCallback(async (): Promise<void> => {
    const {
      lastSessionId,
      lastSessionTitle,
      lastSessionWorkspaceId,
      lastSessionWorkspaceName,
    } = useChatStore.getState();
    // A locked panel resumes only what belongs to its own app; anything else starts a fresh session in the lock.
    const locked = lockedWorkspaceIdRef.current;
    const resumable =
      locked === undefined || (lastSessionWorkspaceId ?? '') === locked;
    if (lastSessionId && resumable) {
      // Adopt before bootstrapping: this path has no session summary to read the scope from, so a remount would resume a scoped session under the general label.
      setWorkspace(lastSessionWorkspaceId ?? '', lastSessionWorkspaceName);
      await bootstrap(lastSessionId, lastSessionTitle);
    } else {
      await bootstrap();
    }
  }, [bootstrap, setWorkspace]);

  // Reopen whatever the failed bootstrap was aiming at. `newChat` is offered alongside it in the view,
  // because a retry can't help when the session itself is gone (a crash takes an unprompted draft with it).
  const retryBootstrap = useCallback((): void => {
    void bootstrapResume();
  }, [bootstrapResume]);

  // Only the driving panel opens a session; taking over re-adopts the one this panel already holds, whose thread is still in the store.
  useEffect(() => {
    if (!isActive) {
      return;
    }
    if (
      sessionIdRef.current &&
      sessionWorkspaceRef.current === workspaceIdRef.current
    ) {
      setCurrentSessionId(sessionIdRef.current);
      return;
    }
    void bootstrapResume();
  }, [isActive, bootstrapResume, setCurrentSessionId]);

  useEffect(() => {
    // Appends agent content to a session's live assistant message (created lazily); each session keeps its own streamingMessageId so background and open turns never share one.
    const ensureAssistant = (sessionId: SessionId): string => {
      const existing =
        useChatStore.getState().threads[sessionId]?.streamingMessageId;

      if (existing) {
        return existing;
      }
      const id = nextId();
      addMessage(sessionId, { id, role: 'assistant', parts: [] });
      setStreamingMessageId(sessionId, id);
      return id;
    };

    const unsubscribeUpdate = onUpdate((sessionId, update) => {
      if (!isDriving()) {
        return; // the other panel owns the stream; taking it too would double every message
      }
      // Content and usage route to their own session's thread; the picker signals (model/mode) apply
      // to the session on screen only, and are re-derived on switch.
      const active = sessionId === sessionIdRef.current;
      switch (update.type) {
        case 'model_change':
          if (!active) {
            return;
          }
          if (update.models.length > 0) {
            // Grow-only merge so a cold/transient re-advertise can't drop an already-shown model (e.g. Fable 5).
            setModels((prev) => mergeModels(prev, update.models));
          }
          if (update.modelId) {
            setCurrentModelId(update.modelId);
          }
          return;
        case 'mode_change':
          if (!active || !update.modeId) {
            return;
          }
          setCurrentModeId(update.modeId);
          return;
        case 'usage':
          // To its own session, not just the one on screen: the meters live per thread now.
          recordUsage(sessionId, update.usedTokens);
          return;
        case 'user_message': {
          const userId = nextId();
          addMessage(sessionId, {
            id: userId,
            role: 'user',
            parts: [{ type: 'text', id: `${userId}-t0`, text: update.delta }],
          });
          setStreamingMessageId(sessionId, undefined);
          return;
        }
        // no default
      }
      const assistantId = ensureAssistant(sessionId);
      switch (update.type) {
        case 'message_chunk':
          appendText(sessionId, assistantId, update.delta);
          break;
        case 'message_status':
          setMessageStatus(sessionId, assistantId, update.status);
          break;
        case 'message_error':
          setMessageError(sessionId, assistantId, update.message);
          break;
        case 'tool_call':
          addToolCall(sessionId, assistantId, update.toolCall);
          break;
        case 'thinking':
          appendThinking(sessionId, assistantId, update.delta);
          break;
        case 'tool_call_update':
          updateToolCall(sessionId, assistantId, update.id, {
            status: update.status,
            output: update.output,
            ...(update.input !== undefined ? { input: update.input } : {}),
            ...(update.outsideWorkspace ? { outsideWorkspace: true } : {}),
          });
          break;
        case 'checklist':
          upsertChecklist(sessionId, assistantId, update.checklist);
          break;
        case 'choices':
          upsertChoices(sessionId, assistantId, update.choices);
          break;
        default: {
          // Exhaustiveness: a new content AgentUpdate must get a case here, or this fails to compile.
          const unhandled: never = update;
          return unhandled;
        }
      }
    });

    const unsubscribePermission = onPermission((request) => {
      if (!isDriving()) {
        return;
      }
      // Store the request on its own session's thread; the display reads the current thread's pendingPermission.
      setPendingPermission(request.sessionId, request);
    });

    return () => {
      unsubscribeUpdate();
      unsubscribePermission();
      bootstrapToken.current += 1; // cancel any in-flight bootstrap
      // Don't close any session on unmount — a turn left running must finish in the background, not be interrupted.
      // Clear the shared pointers only while they are still this panel's, or closing the docked one blanks the chat the user is looking at.
      if (useChatStore.getState().currentSessionId === sessionIdRef.current) {
        setCurrentSessionId(null);
        setDraftSessionId(null);
      }
      sessionIdRef.current = null;
    };
  }, [
    isDriving,
    recordUsage,
    addMessage,
    appendText,
    addToolCall,
    appendThinking,
    upsertChecklist,
    upsertChoices,
    updateToolCall,
    setMessageStatus,
    setMessageError,
    setStreamingMessageId,
    setPendingPermission,
    setCurrentSessionId,
    setDraftSessionId,
  ]);

  useEffect(() => {
    if (!sessionRequest || !isActive) {
      return; // one request, one panel: the hidden one would open a second session and win the global pointer
    }

    if (sessionRequest.type === 'open') {
      reopen(sessionRequest.session);
    } else if (
      sessionRequest.workspace &&
      lockedWorkspaceIdRef.current === undefined
    ) {
      switchWorkspace(
        sessionRequest.workspace.id,
        sessionRequest.workspace.name,
      );
    } else {
      newChat();
    }
    clearSessionRequest();
  }, [
    sessionRequest,
    isActive,
    reopen,
    newChat,
    switchWorkspace,
    clearSessionRequest,
  ]);

  useEffect(
    () => () => {
      clearSessionRequest();
      setSessionActionError(undefined);
    },
    [clearSessionRequest, setSessionActionError],
  );

  const send = useCallback(
    async (text: string): Promise<void> => {
      const trimmed = text.trim();
      const sessionId = sessionIdRef.current;
      if (
        !trimmed ||
        !sessionId ||
        useChatStore.getState().streamingSessions[sessionId]
      ) {
        return;
      }

      // The session now has content: it earns its own sidebar row, so it stops being a draft and the
      // "New Session" entry hands the selection over to it.
      setDraftSessionId(null);

      const userId = nextId();
      addMessage(sessionId, {
        id: userId,
        role: 'user',
        parts: [{ type: 'text', id: `${userId}-t0`, text: trimmed }],
      });
      const assistantId = nextId();
      addMessage(sessionId, { id: assistantId, role: 'assistant', parts: [] });
      setStreamingMessageId(sessionId, assistantId);
      setSessionStreaming(sessionId, true); // per-session flag, so a switch doesn't lose track of this turn
      startTurnMeters(sessionId); // each question counts from zero, and the clock starts now

      let succeeded = false;
      try {
        if (isOffline()) {
          setMessageError(sessionId, assistantId, '', 'network');
        } else {
          await prompt(sessionId, trimmed, getEditorContextRef.current?.());
          succeeded = true;
        }
      } catch (e) {
        const { message, kind, code } = parseAgentError(e);
        if (isAuthError(message, code)) {
          setSessionExpired(true);
          setAuth({ authenticated: false }); // drop to the connect screen to re-authenticate
        } else {
          const failure = isNetworkError(message) ? 'network' : kind;
          setMessageError(sessionId, assistantId, message, failure);
        }
      } finally {
        // The turn ended for THIS session, regardless of which session is on screen now — always clear its flags.
        setSessionStreaming(sessionId, false);
        setStreamingMessageId(sessionId, undefined);
        // An ended turn (e.g. stopped) can't answer a permission prompt — drop any left pending.
        setPendingPermission(sessionId, undefined);
        // Finished while the user had switched away → light the sidebar's "reply ready" dot.
        const isBackground =
          sessionId !== useChatStore.getState().currentSessionId;
        if (succeeded && isBackground) {
          markReplyReady(sessionId);
        }
        refreshSessionTitle(sessionId);
      }
    },
    [
      addMessage,
      setStreamingMessageId,
      setSessionStreaming,
      startTurnMeters,
      setPendingPermission,
      setMessageError,
      setDraftSessionId,
      setAuth,
      setSessionExpired,
      markReplyReady,
      refreshSessionTitle,
    ],
  );

  // Abort the in-flight turn; the agent settles the pending prompt() so send()'s finally resets streaming.
  const stop = useCallback(async (): Promise<void> => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || !useChatStore.getState().streamingSessions[sessionId]) {
      return;
    }
    const streamingId =
      useChatStore.getState().threads[sessionId]?.streamingMessageId;
    if (streamingId) {
      setMessageCancelled(sessionId, streamingId);
    }
    await cancel(sessionId);
  }, [setMessageCancelled]);

  const setModel = useCallback(async (modelId: string): Promise<void> => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) {
      return;
    }
    try {
      await setSessionModel(sessionId, modelId);
      setCurrentModelId(modelId);
    } catch {
      // failed switch: resync the picker to the agent's actual model
      const state = await getSessionState(sessionId).catch(() => null);
      if (state) {
        setCurrentModelId(state.modelId);
      }
    }
  }, []);

  const setMode = useCallback(async (modeId: string): Promise<void> => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) {
      return;
    }
    try {
      await setSessionMode(sessionId, modeId);
      setCurrentModeId(modeId);
    } catch {
      // failed switch: resync the picker to the agent's actual mode
      const state = await getSessionState(sessionId).catch(() => null);
      if (state) {
        setCurrentModeId(state.modeId);
      }
    }
  }, []);

  const respondPermission = useCallback(
    (outcome: PermissionOutcome): void => {
      const sessionId = sessionIdRef.current;
      const request = sessionId
        ? useChatStore.getState().threads[sessionId]?.pendingPermission
        : undefined;
      if (!sessionId || !request) {
        return;
      }
      permissionReply(request.id, outcome);
      setPendingPermission(sessionId, undefined);
    },
    [setPendingPermission],
  );

  const respondChoices = useCallback(
    (
      requestId: string,
      submission: ChoiceSubmission,
      echo?: ChoiceEcho,
    ): void => {
      // Echo the answer as a real user turn (a 'choice-answer' part rendered as its own
      // bubble); the agent's continuation then opens a fresh assistant message (so the
      // thread reads question → answer → reply).
      const sessionId = sessionIdRef.current;
      if (echo && sessionId) {
        const userId = nextId();
        addMessage(sessionId, {
          id: userId,
          role: 'user',
          parts: [
            {
              type: 'choice-answer',
              id: `${userId}-a0`,
              question: echo.question,
              answer: echo.answer,
              ...(echo.skipped ? { skipped: true } : {}),
            },
          ],
        });
        setStreamingMessageId(sessionId, undefined);
      }
      choicesReply(requestId, submission);
    },
    [addMessage, setStreamingMessageId],
  );

  const retry = useCallback(
    async (assistantMessageId: string): Promise<void> => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        return;
      }

      const allMessages =
        useChatStore.getState().threads[sessionId]?.messages ?? [];
      const idx = allMessages.findIndex((m) => m.id === assistantMessageId);
      const userMessage = idx > 0 ? allMessages[idx - 1] : undefined;
      if (userMessage?.role !== 'user') {
        return;
      }
      const text = userMessage.parts
        .map((p) => (p.type === 'text' ? p.text : ''))
        .join('');
      if (!text) return;

      // Replay the turn from scratch: drop the failed reply *and* the prompt behind it, since
      // send() re-adds that prompt — otherwise the question stays in the thread twice.
      removeMessage(sessionId, assistantMessageId);
      removeMessage(sessionId, userMessage.id);
      await send(text);
    },
    [removeMessage, send],
  );

  const [fileError, setFileError] = useState<string>();
  const openFile = useCallback((path: string): void => {
    setFileError(undefined);
    void openAgentFile(path).catch((e: unknown) => {
      setFileError(parseAgentError(e).message);
    });
  }, []);
  const dismissFileError = useCallback((): void => setFileError(undefined), []);

  const dismissSessionActionError = useCallback(
    (): void => setSessionActionError(undefined),
    [setSessionActionError],
  );

  // Only the newest message can carry a live failure; anything further back is history the composer
  // shouldn't reopen. Being derived rather than stored is also what retires the banner without a close
  // button: a retry replaces the message, and the next prompt (or a session switch) pushes it out of
  // last place — so there is nothing to dismiss.
  const lastMessage = messages[messages.length - 1];
  const requestError =
    lastMessage?.status === 'error' &&
    (lastMessage.error || lastMessage.errorKind)
      ? {
          messageId: lastMessage.id,
          message: lastMessage.error,
          kind: lastMessage.errorKind,
        }
      : undefined;

  return {
    messages,
    isStreaming,
    usedTokens,
    turnStartedAt,
    permission: pendingPermission && permissionView(pendingPermission),
    requestError,
    bootstrapError,
    retryBootstrap,
    models,
    currentModelId,
    setModel,
    modes,
    currentModeId,
    setMode,
    send,
    stop,
    retry,
    respondPermission,
    respondChoices,
    sessionTitle,
    isLoadingSession,
    isNewSession: messages.length === 0 && !isLoadingSession,
    workspaceId,
    workspaceName,
    selectWorkspace,
    reopen,
    newChat,
    currentSessionId: ownSessionId,
    openFile,
    fileError,
    dismissFileError,
    sessionActionError:
      sessionActionError && actionErrorMessages[sessionActionError],
    dismissSessionActionError,
  };
};
