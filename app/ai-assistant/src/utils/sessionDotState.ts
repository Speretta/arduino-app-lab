import { SessionSummary } from '../services';

// Visual state of a session row's leading indicator (per Figma "Session Item States").
// UI-only, and deliberately not the service's `SessionState`, which is a turn status.
export type SessionDotState =
  | 'idle'
  | 'typing'
  | 'replyReady'
  | 'active'
  | 'error'
  | 'muted';

export interface SessionDotStateSignals {
  currentSessionId?: string | null;
  // Live signals AgentSidePanel tracks but a one-shot history list (read on open, not kept
  // live) doesn't have — callers without them just get 'typing'/'replyReady'/'error' from
  // the session's own persisted status instead.
  isStreaming?: boolean;
  isReplyReady?: boolean;
  hasCurrentError?: boolean;
}

// Precedence rule behind a session row's dot (per Figma "Session Item States"): typing beats
// replyReady beats error beats active/idle. Shared so AgentSidePanel (live) and the editor-mode
// history picker (snapshot) render the same states from whatever signals each one has.
export const sessionDotState = (
  session: SessionSummary,
  {
    currentSessionId,
    isStreaming,
    isReplyReady,
    hasCurrentError,
  }: SessionDotStateSignals = {},
): SessionDotState => {
  const isCurrent = session.id === currentSessionId;
  if (isStreaming || session.status === 'running') {
    return 'typing';
  }

  if (!isCurrent && isReplyReady) {
    return 'replyReady';
  }

  if (session.status === 'error' || (isCurrent && hasCurrentError)) {
    return 'error';
  }

  return isCurrent ? 'active' : 'idle';
};
