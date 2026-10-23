import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPanel } from './ChatPanel';
import type { ChatPanelLogic } from './ChatPanel.logic';

// jsdom has no layout engine, so it doesn't implement ResizeObserver — used by
// ChatInput's textarea auto-grow and the thread's own scroll tracking. Real
// browsers always have it; only the test environment needs the stub.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

// Which greeting shows is the host's call (the `docked` prop), not the panel's
// width: dragging the docked side panel wider must not turn it into the
// full-screen Agent Mode view.
const emptySessionLogic: ChatPanelLogic = {
  messages: [],
  isStreaming: false,
  usedTokens: 0,
  retryBootstrap: vi.fn(),
  models: [],
  setModel: vi.fn(),
  modes: [],
  setMode: vi.fn(),
  send: vi.fn(),
  stop: vi.fn(),
  retry: vi.fn(),
  respondPermission: vi.fn(),
  respondChoices: vi.fn(),
  isLoadingSession: false,
  isNewSession: true,
  reopen: vi.fn(),
  newChat: vi.fn(),
  currentSessionId: null,
  openFile: vi.fn(),
  dismissFileError: vi.fn(),
  dismissSessionActionError: vi.fn(),
  workspaceId: '',
  selectWorkspace: vi.fn(),
};

// Swapped per test so a case can render a started session instead of the empty one.
let logic: ChatPanelLogic = emptySessionLogic;

vi.mock('./ChatPanel.logic', () => ({
  useChatLogic: (): ChatPanelLogic => logic,
}));

afterEach(() => {
  logic = emptySessionLogic;
});

describe('ChatPanel empty state', () => {
  it('greets full-screen in Agent Mode', () => {
    render(<ChatPanel />);

    expect(
      screen.getByText('Hi, what do you want to build today?'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Ask about this app — the agent already sees the file you have open.',
      ),
    ).not.toBeInTheDocument();
  });

  it('keeps the compact greeting in the docked panel, at any width', () => {
    render(<ChatPanel docked />);

    expect(
      screen.getByText(
        'Ask about this app — the agent already sees the file you have open.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Hi, what do you want to build today?'),
    ).not.toBeInTheDocument();
  });

  // A board with no apps of its own leaves only the general workspace to offer, and the row still has to say
  // which one the session opens in — hiding it there left "new session" with no stated scope at all.
  it('states the workspace even when the general one is the only choice', () => {
    render(
      <ChatPanel
        workspaces={[{ id: '', name: 'Arduino Apps', icon: '\u{1F4C1}' }]}
      />,
    );

    expect(screen.getByText('New session in')).toBeInTheDocument();
    expect(screen.getByText('Arduino Apps')).toBeInTheDocument();
  });
});

describe('ChatPanel top shadow', () => {
  // jsdom has no layout, so the thread's scroll geometry is set by hand. The thread is a
  // column-reverse scroller: offset 0 is the bottom and the top is -(scrollHeight - clientHeight).
  const scrollThread = (
    thread: HTMLElement,
    { scrollHeight, scrollTop }: { scrollHeight: number; scrollTop: number },
  ): void => {
    Object.defineProperty(thread, 'scrollHeight', {
      configurable: true,
      value: scrollHeight,
    });
    Object.defineProperty(thread, 'clientHeight', {
      configurable: true,
      value: 400,
    });
    thread.scrollTop = scrollTop;
    fireEvent.scroll(thread);
  };

  const renderThread = (): { thread: HTMLElement; shadow: HTMLElement } => {
    render(<ChatPanel />);
    return {
      thread: screen.getByTestId('chat-thread'),
      shadow: screen.getByTestId('chat-thread-shadow'),
    };
  };

  it('shows while older content sits above the viewport', () => {
    const { thread, shadow } = renderThread();

    scrollThread(thread, { scrollHeight: 1000, scrollTop: 0 });

    expect(shadow).toHaveStyle({ opacity: '1' });
  });

  it('hides once the reader reaches the top', () => {
    const { thread, shadow } = renderThread();
    scrollThread(thread, { scrollHeight: 1000, scrollTop: -300 });
    expect(shadow).toHaveStyle({ opacity: '1' });

    scrollThread(thread, { scrollHeight: 1000, scrollTop: -600 });

    expect(shadow).toHaveStyle({ opacity: '0' });
  });

  it('stays hidden when the thread is too short to scroll', () => {
    const { thread, shadow } = renderThread();

    scrollThread(thread, { scrollHeight: 400, scrollTop: 0 });

    expect(shadow).toHaveStyle({ opacity: '0' });
  });
});

// The docked panel names the workspace in its own header; Agent Mode renders the panel's toolbar
// instead, so the chip has to come from here or the workspace is only visible in the picker.
describe('ChatPanel toolbar', () => {
  it('names the session workspace next to the session title', () => {
    logic = {
      ...emptySessionLogic,
      isNewSession: false,
      currentSessionId: 'session-1',
      sessionTitle: 'Blink the LED',
      workspaceId: 'app-1',
      workspaceName: 'Weather Station',
    };

    render(
      <ChatPanel
        workspaces={[
          { id: '', name: 'Arduino Apps', icon: '\u{1F4C1}' },
          { id: 'app-1', name: 'Weather Station', icon: '\u{1F4C1}' },
        ]}
      />,
    );

    // CSS-module class names are hashed, so the toolbar is reached through the title it holds.
    // Scoping matters: an unscoped query passes with the chip anywhere in the tree, the picker
    // below the thread included.
    const title = screen.getByText('Blink the LED');
    const toolbar = title.parentElement as HTMLElement;

    expect(within(toolbar).getByText('Weather Station')).toBeInTheDocument();
    // The chip is the only place naming it: the workspace row is gone once the session has started.
    expect(screen.getAllByText('Weather Station')).toHaveLength(1);
  });

  it('leaves the workspace chip out until the session has a title', () => {
    render(
      <ChatPanel
        workspaces={[{ id: '', name: 'Arduino Apps', icon: '\u{1F4C1}' }]}
      />,
    );

    expect(screen.getAllByText('Arduino Apps')).toHaveLength(1);
  });
});

// A session's workspace is fixed when it is created, so the row is offered only while the chat is empty.
describe('ChatPanel workspace row', () => {
  it('offers the picker on an empty chat', () => {
    render(
      <ChatPanel
        workspaces={[
          { id: '', name: 'Arduino Apps', icon: '\u{1F4C1}' },
          { id: 'app-1', name: 'Weather Station', icon: '\u{1F4C1}' },
        ]}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Workspace' }),
    ).toBeInTheDocument();
  });

  it('drops the row once the session has started', () => {
    logic = {
      ...emptySessionLogic,
      isNewSession: false,
      currentSessionId: 'session-1',
      workspaceId: 'app-1',
      workspaceName: 'Weather Station',
    };

    render(
      <ChatPanel
        workspaces={[
          { id: '', name: 'Arduino Apps', icon: '\u{1F4C1}' },
          { id: 'app-1', name: 'Weather Station', icon: '\u{1F4C1}' },
        ]}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Workspace' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('New session in')).not.toBeInTheDocument();
  });
});
