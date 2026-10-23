import { act, fireEvent, render, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listSessions, SessionSummary } from '../../services';
import { useAiAssistantStore, useChatStore } from '../../store';
import { AgentSidePanel } from './AgentSidePanel';

// SidePanel.Bottom navigates to the settings route, and there is no router around a bare render.
vi.mock('@tanstack/react-router', async () => ({
  ...(await vi.importActual('@tanstack/react-router')),
  useNavigate: (): VoidFunction => vi.fn(),
}));

// The panel's mutations hit the DI coding-agent service, which throws "not implemented" outside a running agent.
vi.mock('../../services', () => ({
  listSessions: vi.fn(),
  deleteSession: vi.fn(),
  pinSession: vi.fn(),
  renameSession: vi.fn(),
}));

const sessions: SessionSummary[] = [
  {
    id: 's1',
    title: 'Camera init',
    workspaceAppId: 'snack',
    workspaceName: 'Snack Sorter',
  },
  {
    id: 's2',
    title: 'Classifier tuning',
    workspaceAppId: 'snack',
    workspaceName: 'Snack Sorter',
  },
  {
    id: 's3',
    title: 'Wind readings',
    workspaceAppId: 'weather',
    workspaceName: 'Weather Station',
  },
  { id: 's4', title: 'How Bricks work' },
];

// Each row also renders its title into a tooltip, portaled to the body — querying inside the panel leaves those out.
let panel: HTMLElement;

const renderPanel = (): void => {
  panel = render(
    <AgentSidePanel boards={[]} onSelectBoard={vi.fn()} />,
  ).container;
};

const rows = (title: string): HTMLElement[] =>
  within(panel).queryAllByText(title);
const row = async (title: string): Promise<HTMLElement> =>
  within(panel).findByText(title);

describe('AgentSidePanel session folders', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    useAiAssistantStore
      .getState()
      .setAuth({ authenticated: true, agentId: 'claude' });
    vi.mocked(listSessions).mockResolvedValue(sessions);
  });

  it('shows one folder per app plus the general one, expanding the folder of the open session', async () => {
    useChatStore.setState({ currentSessionId: 's3' });
    renderPanel();

    expect(await row('Snack Sorter')).toBeInTheDocument();
    expect(rows('Weather Station')).toHaveLength(1);
    expect(rows('Arduino Apps')).toHaveLength(1);

    // Only the open session's folder is expanded; the others keep their sessions out of the list.
    expect(rows('Wind readings')).toHaveLength(1);
    expect(rows('Camera init')).toHaveLength(0);
    expect(rows('How Bricks work')).toHaveLength(0);
  });

  it('opens a collapsed folder on click and closes it again', async () => {
    renderPanel();

    const folder = await row('Snack Sorter');
    fireEvent.click(folder);
    expect(rows('Camera init')).toHaveLength(1);
    expect(rows('Classifier tuning')).toHaveLength(1);

    fireEvent.click(folder);
    expect(rows('Camera init')).toHaveLength(0);
  });

  // The caret is the obvious thing to click, and it used to sit outside the row's click target.
  it('opens a collapsed folder from its caret too', async () => {
    renderPanel();

    const clickTarget = (await row('Snack Sorter')).closest(
      '[role="button"]',
    ) as HTMLElement;
    // The folder icon and the caret: both inside the click target, so the whole row toggles.
    const icons = clickTarget.querySelectorAll('svg');
    expect(icons).toHaveLength(2);

    fireEvent.click(icons[1]);
    expect(rows('Camera init')).toHaveLength(1);
  });

  // Pinning is what takes a session out of its folder: it must not show up in both places.
  it('lists a pinned session in the pinned group only', async () => {
    vi.mocked(listSessions).mockResolvedValue([
      { ...sessions[0], pinned: true },
      sessions[1],
    ]);
    renderPanel();

    expect(await row('Pinned')).toBeInTheDocument();
    expect(rows('Camera init')).toHaveLength(1);

    // Its folder still holds the unpinned sibling, so opening it must not turn up the pinned row again.
    fireEvent.click(await row('Snack Sorter'));
    expect(rows('Classifier tuning')).toHaveLength(1);
    expect(rows('Camera init')).toHaveLength(1);
  });

  // A draft has no row of its own, so nothing resolves its folder — the tree must not shut on every "New chat".
  it('keeps the folder expanded when the open session is a draft with no row', async () => {
    useChatStore.setState({ currentSessionId: 's3' });
    renderPanel();

    expect(await row('Wind readings')).toBeInTheDocument();

    await act(async () => {
      useChatStore.setState({ currentSessionId: 'draft-1' });
    });

    expect(rows('Wind readings')).toHaveLength(1);
  });

  // A folder is the grouping itself, so the last session leaving it takes the row with it.
  it('drops a folder once it has no sessions', async () => {
    vi.mocked(listSessions).mockResolvedValue([sessions[3]]);
    renderPanel();

    expect(await row('Arduino Apps')).toBeInTheDocument();
    expect(rows('Snack Sorter')).toHaveLength(0);
  });
});
