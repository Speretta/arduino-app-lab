import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SidePanel } from './index';
import { SidePanelLogic } from './sidePanel.type';

const navigate = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    className,
    children,
  }: {
    to: string;
    className?: string;
    children: React.ReactNode;
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  // The Bottom row navigates to /account and /settings on click.
  useNavigate: () => navigate,
}));

// Every Row renders its title twice: the truncated label and the tooltip that
// repeats the full text. Row queries target the label.
const getRowLabel = (text: string): HTMLElement =>
  screen.getByText(text, { ignore: '[role="tooltip"] *' });

const baseLogic: ReturnType<SidePanelLogic> = {
  visible: true,
  activeItemId: undefined,
  board: undefined,
  boards: [],
  onSelectBoard: vi.fn(),
  onCreateApp: vi.fn(),
  onImportApp: vi.fn(),
  user: { initials: 'AA' },
};

const renderSidePanel = (
  overrides: Partial<ReturnType<SidePanelLogic>> = {},
): ReturnType<typeof render> => {
  const sidePanelLogic: SidePanelLogic = () => ({ ...baseLogic, ...overrides });
  return render(<SidePanel sidePanelLogic={sidePanelLogic} />);
};

describe('SidePanel', () => {
  it('renders every composed Row', () => {
    renderSidePanel();

    expect(getRowLabel('Apps')).toBeInTheDocument();
    expect(getRowLabel('Inspirations')).toBeInTheDocument();
    expect(getRowLabel('Examples')).toBeInTheDocument();
    expect(getRowLabel('Resources')).toBeInTheDocument();
    expect(getRowLabel('Bricks')).toBeInTheDocument();
  });

  it('links Examples to /examples and Resources to /learn', () => {
    renderSidePanel();

    expect(getRowLabel('Examples').closest('a')).toHaveAttribute(
      'href',
      '/examples',
    );
    expect(getRowLabel('Resources').closest('a')).toHaveAttribute(
      'href',
      '/learn',
    );
  });

  it('renders a link for a Row with a route', () => {
    renderSidePanel();

    expect(getRowLabel('Apps').closest('a')).toHaveAttribute(
      'href',
      '/my-apps',
    );
    expect(getRowLabel('Bricks').closest('a')).toHaveAttribute(
      'href',
      '/bricks',
    );
  });

  it('marks the active Row via aria-current, and only that Row', () => {
    renderSidePanel({ activeItemId: 'my-apps' });

    expect(getRowLabel('Apps').closest('[id="my-apps"]')).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      getRowLabel('Examples').closest('[id="examples"]'),
    ).not.toHaveAttribute('aria-current');
  });

  it('marks Examples active on /examples and Resources active on /learn', () => {
    const { unmount } = renderSidePanel({ activeItemId: 'examples' });
    expect(getRowLabel('Examples').closest('[id="examples"]')).toHaveAttribute(
      'aria-current',
      'page',
    );
    unmount();

    renderSidePanel({ activeItemId: 'learn' });
    expect(
      getRowLabel('Resources').closest('[id="resources"]'),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('renders the Apps trailing create-app action', () => {
    renderSidePanel();

    expect(screen.getByLabelText('Create new App')).toBeInTheDocument();
  });

  it('collapses the accordion when its header button is clicked', () => {
    renderSidePanel();

    const header = screen.getByRole('button', { name: 'Learn and explore' });
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(getRowLabel('Examples')).toBeInTheDocument();

    fireEvent.click(header);

    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Examples')).toBeNull();
  });

  it('returns null when not visible', () => {
    const { container } = renderSidePanel({ visible: false });

    expect(container).toBeEmptyDOMElement();
  });
});
