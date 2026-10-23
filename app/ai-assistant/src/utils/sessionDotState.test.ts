import { describe, expect, it } from 'vitest';

import { SessionSummary } from '../services';
import { sessionDotState } from './sessionDotState';

const session = (overrides: Partial<SessionSummary> = {}): SessionSummary => ({
  id: 's1',
  ...overrides,
});

describe('sessionDotState', () => {
  it('is idle for another session with no signals', () => {
    expect(sessionDotState(session())).toBe('idle');
  });

  it('is active for the current session with no signals', () => {
    expect(sessionDotState(session(), { currentSessionId: 's1' })).toBe(
      'active',
    );
  });

  it('is typing when the backend reports the session running', () => {
    expect(sessionDotState(session({ status: 'running' }))).toBe('typing');
  });

  it('is typing when streaming, even for the current session', () => {
    expect(
      sessionDotState(session(), {
        currentSessionId: 's1',
        isStreaming: true,
      }),
    ).toBe('typing');
  });

  it('is replyReady for a background session with an unseen reply', () => {
    expect(
      sessionDotState(session(), {
        currentSessionId: 'other',
        isReplyReady: true,
      }),
    ).toBe('replyReady');
  });

  it('ignores replyReady for the current session', () => {
    expect(
      sessionDotState(session(), {
        currentSessionId: 's1',
        isReplyReady: true,
      }),
    ).toBe('active');
  });

  it('is error when the backend reports the last turn errored', () => {
    expect(sessionDotState(session({ status: 'error' }))).toBe('error');
  });

  it('is error for the current session with a live error, absent a persisted status', () => {
    expect(
      sessionDotState(session(), {
        currentSessionId: 's1',
        hasCurrentError: true,
      }),
    ).toBe('error');
  });

  it('ignores hasCurrentError for a session that is not current', () => {
    expect(
      sessionDotState(session(), {
        currentSessionId: 'other',
        hasCurrentError: true,
      }),
    ).toBe('idle');
  });

  it('ranks typing above replyReady, error and active', () => {
    expect(
      sessionDotState(session({ status: 'error' }), {
        currentSessionId: 'other',
        isStreaming: true,
        isReplyReady: true,
      }),
    ).toBe('typing');
  });

  it('ranks replyReady above error for a background session', () => {
    expect(
      sessionDotState(session({ status: 'error' }), {
        currentSessionId: 'other',
        isReplyReady: true,
      }),
    ).toBe('replyReady');
  });
});
