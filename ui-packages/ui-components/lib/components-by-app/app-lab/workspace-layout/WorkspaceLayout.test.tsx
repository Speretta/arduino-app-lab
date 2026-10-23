/**
 * Tests for WorkspaceLayout's pixel-persisted panel sizes (first-visit
 * fallback, debounced persist) for both the console and side panels, plus the
 * content rendering that this component owns.
 */

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';

import { panelStorageKey } from './hooks/useWorkspacePanel';
import { WorkspaceLayout, WorkspaceLayoutProps } from './WorkspaceLayout';

const mockState = vi.hoisted(() => ({
  panels: new Map<string, PanelEntry>(),
  groupCalls: [] as Array<Record<string, unknown>>,
}));

// Minimal shape of a registered mock panel: its imperative handle plus the
// latest `onResize`/`onDrag` props the component passed on the last render.
interface PanelEntry {
  handle: {
    state: { collapsed: boolean; sizePx: number; sizePct: number };
    isCollapsed: Mock<() => boolean>;
    expand: Mock<() => void>;
    collapse: Mock<() => void>;
    resize: Mock<(value: number | string) => void>;
    getSize: Mock<() => { inPixels: number; asPercentage: number }>;
  };
  onResize?: () => void;
  onDrag?: () => void;
  /** Latest props, so tests can assert the constraints a panel was given. */
  props: MockPanelProps;
}

interface MockPanelProps {
  id: string;
  panelRef?: (handle: PanelEntry['handle'] | null) => void;
  defaultSize?: number;
  collapsedSize?: number;
  collapsible?: boolean;
  minSize?: number;
  maxSize?: number;
  onResize?: () => void;
  onDrag?: () => void;
  children?: React.ReactNode;
}

interface MockGroupProps {
  orientation?: string;
  defaultLayout?: unknown;
  onLayoutChange?: (layout: unknown) => void;
  onLayoutChanged?: (layout: unknown) => void;
  children?: React.ReactNode;
  [key: string]: unknown;
}

vi.mock('react-resizable-panels', async () => {
  const actualReact = (await vi.importActual('react')) as {
    default?: typeof import('react');
  } & typeof import('react');
  const React = actualReact.default ?? actualReact;
  const { panels, groupCalls } = mockState;

  // Mirrors the real hook: exposes the panel handle once the Panel registers
  // itself and a stable ref setter for the Panel's `panelRef` prop.
  const usePanelCallbackRef = (): [unknown, (handle: unknown) => void] => {
    const [panel, setPanel] = React.useState<unknown>(null);
    const setRef = React.useCallback(
      (handle: unknown) => setPanel(handle ?? null),
      [],
    );
    return [panel, setRef];
  };

  const Panel = (props: MockPanelProps): unknown => {
    const {
      id,
      panelRef,
      defaultSize,
      collapsedSize,
      onResize,
      onDrag,
      children,
    } = props;
    const handleRef = React.useRef(null as PanelEntry['handle'] | null);
    if (!handleRef.current) {
      // Model the group's total space so the hook's sibling-percentage math
      // (size.inPixels + otherPanelPx) resolves to a realistic available size.
      // The real library clamps a panel's size to fit the container and
      // derives its percentage from the total; mirror that here.
      const containerTotal = window.innerHeight;
      // The real library derives collapsed state from size: defaultSize ===
      // collapsedSize implies isCollapsed() === true.
      const sizePx = Math.min(defaultSize ?? 200, containerTotal);
      const state = {
        collapsed: collapsedSize != null && sizePx <= collapsedSize,
        sizePx,
        sizePct: (sizePx / containerTotal) * 100,
      };
      handleRef.current = {
        state,
        isCollapsed: vi.fn(() => state.collapsed),
        // The real library moves the panel to its collapsed/restored size, not
        // just a flag — which is exactly what makes a collapse observable to
        // `onResize`, and so to the size persistence.
        expand: vi.fn(() => {
          const restored = Math.min(defaultSize ?? 200, containerTotal);
          state.collapsed = false;
          state.sizePx = restored;
          state.sizePct = (restored / containerTotal) * 100;
        }),
        collapse: vi.fn(() => {
          state.collapsed = true;
          if (collapsedSize != null) {
            state.sizePx = collapsedSize;
            state.sizePct = (collapsedSize / containerTotal) * 100;
          }
        }),
        resize: vi.fn((value: number | string) => {
          if (typeof value === 'number') {
            state.sizePx = value;
            state.sizePct = (value / containerTotal) * 100;
            state.collapsed = false;
          }
        }),
        getSize: vi.fn(() => ({
          inPixels: state.sizePx,
          asPercentage: state.sizePct,
        })),
      };
    }
    panels.set(id, { handle: handleRef.current, onResize, onDrag, props });
    React.useEffect(() => {
      panelRef?.(handleRef.current);
      return () => panelRef?.(null);
    }, [panelRef]);
    return React.createElement('div', { 'data-panel-id': id }, children);
  };

  const Group = (props: MockGroupProps): unknown => {
    groupCalls.push(props);
    return React.createElement(
      'div',
      { 'data-group-orientation': props.orientation },
      props.children,
    );
  };

  const Separator = (): unknown =>
    React.createElement('div', { 'data-separator': true });

  return {
    Group,
    Panel,
    Separator,
    usePanelCallbackRef,
  };
});

const CONSOLE_ID = 'console';
const SIDE_ID = 'side';
const LSP_REFERENCES_ID = 'references';
const APP_ID = 'app1';

const panelEntry = (id: string): PanelEntry => {
  const entry = mockState.panels.get(id);
  if (!entry) {
    throw new Error(`${id} panel was never registered`);
  }
  return entry;
};

const consoleEntry = (): PanelEntry => panelEntry(CONSOLE_ID);
const consoleHandle = (): PanelEntry['handle'] => consoleEntry().handle;

const sideEntry = (): PanelEntry => panelEntry(SIDE_ID);
const sideHandle = (): PanelEntry['handle'] => sideEntry().handle;

const storeConsoleSize = (px: number): void => {
  localStorage.setItem(panelStorageKey(CONSOLE_ID, APP_ID), JSON.stringify(px));
};

const readConsoleSize = (): number | undefined => {
  const raw = localStorage.getItem(panelStorageKey(CONSOLE_ID, APP_ID));
  return raw ? JSON.parse(raw) : undefined;
};

const storeSideSize = (px: number): void => {
  localStorage.setItem(panelStorageKey(SIDE_ID), JSON.stringify(px));
};

const readSideSize = (): number | undefined => {
  const raw = localStorage.getItem(panelStorageKey(SIDE_ID));
  return raw ? JSON.parse(raw) : undefined;
};

const lspReferencesEntry = (): PanelEntry => panelEntry(LSP_REFERENCES_ID);
const lspReferencesHandle = (): PanelEntry['handle'] =>
  lspReferencesEntry().handle;

const isLspReferencesMounted = (): boolean =>
  document.querySelector(`[data-panel-id="${LSP_REFERENCES_ID}"]`) !== null;

/** The panel group a panel belongs to, for asserting the tree's shape. */
const groupOf = (panelId: string): Element | null =>
  document
    .querySelector(`[data-panel-id="${panelId}"]`)
    ?.closest('[data-group-orientation]') ?? null;

const lspReferencesSize = (): number | undefined => {
  const raw = localStorage.getItem(panelStorageKey(LSP_REFERENCES_ID));
  return raw ? JSON.parse(raw) : undefined;
};

const layoutElement = (
  props: Partial<WorkspaceLayoutProps> = {},
): React.ReactElement => (
  <WorkspaceLayout
    appId={APP_ID}
    sideContent={<div>side-content</div>}
    editorContent={<div>editor-content</div>}
    consoleContent={<div>console-content</div>}
    {...props}
  />
);

const renderLayout = (
  props: Partial<WorkspaceLayoutProps> = {},
): ReturnType<typeof render> => render(layoutElement(props));

beforeEach(() => {
  mockState.panels.clear();
  mockState.groupCalls.length = 0;
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('WorkspaceLayout console default size', () => {
  it('starts collapsed on first visit (nothing stored)', () => {
    renderLayout();

    expect(consoleHandle().state.sizePx).toBe(36);
    expect(consoleHandle().isCollapsed()).toBe(true);
  });

  it('restores a stored expanded height', () => {
    storeConsoleSize(350);
    renderLayout();

    expect(consoleHandle().state.sizePx).toBe(350);
    expect(consoleHandle().isCollapsed()).toBe(false);
  });

  it('restores collapsed when the stored size is the collapsed strip', () => {
    storeConsoleSize(36);
    renderLayout();

    expect(consoleHandle().state.sizePx).toBe(36);
    expect(consoleHandle().isCollapsed()).toBe(true);
  });
});

describe('WorkspaceLayout console height persistence', () => {
  it('debounces a resize and stores the new pixel height', () => {
    vi.useFakeTimers();
    renderLayout();

    act(() => {
      consoleHandle().resize(400);
      consoleEntry().onResize?.();
      vi.advanceTimersByTime(300);
    });

    expect(readConsoleSize()).toBe(400);
  });

  it('does not persist a resize when unmounted within the debounce window', () => {
    vi.useFakeTimers();
    const { unmount } = renderLayout();

    act(() => {
      consoleHandle().resize(400);
      consoleEntry().onResize?.();
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(readConsoleSize()).toBeUndefined();
  });
});

describe('WorkspaceLayout side panel persistence', () => {
  it('starts at the default width on first visit (nothing stored)', () => {
    renderLayout();

    expect(sideHandle().state.sizePx).toBe(216);
  });

  it('restores a stored expanded width', () => {
    storeSideSize(240);
    renderLayout();

    expect(sideHandle().state.sizePx).toBe(240);
    expect(sideHandle().isCollapsed()).toBe(false);
  });

  it('restores collapsed when the stored size is the collapsed strip', () => {
    storeSideSize(44);
    renderLayout();

    expect(sideHandle().state.sizePx).toBe(44);
    expect(sideHandle().isCollapsed()).toBe(true);
  });

  it('debounces a resize and stores the new pixel width globally', () => {
    vi.useFakeTimers();
    renderLayout();

    act(() => {
      sideHandle().resize(260);
      sideEntry().onResize?.();
      vi.advanceTimersByTime(300);
    });

    expect(readSideSize()).toBe(260);
  });

  it('cannot be dragged wider than the cap', () => {
    renderLayout();

    expect(sideEntry().props.maxSize).toBe(600);
  });

  it('renders the side, editor and console content', () => {
    renderLayout();

    expect(screen.getByText('side-content')).toBeInTheDocument();
    expect(screen.getByText('editor-content')).toBeInTheDocument();
    expect(screen.getByText('console-content')).toBeInTheDocument();
  });
});

const REFERENCES = <div>references-content</div>;

describe('WorkspaceLayout references panel', () => {
  /**
   * Closed means absent, not a mounted panel held at zero width. That is what
   * lets the column be non-collapsible, and so gives its border a real floor.
   */
  it('does not mount the column until there is something to show', () => {
    renderLayout();

    expect(isLspReferencesMounted()).toBe(false);
    expect(screen.queryByText('references-content')).not.toBeInTheDocument();
  });

  it('renders its content when given', () => {
    renderLayout({ referencesContent: REFERENCES });

    expect(screen.getByText('references-content')).toBeInTheDocument();
  });

  /**
   * Flat, the file tree's separator pivots on the references column, so every
   * change to the tree — a drag, or the auto-collapse being overruled — came out
   * of the column instead of the editor. One level down, the tree's neighbour is
   * a plain panel with no constraints, and the column keeps its own width.
   */
  it('keeps the column in its own group, not alongside the file tree', () => {
    renderLayout({ referencesContent: REFERENCES });

    const sideGroup = groupOf(SIDE_ID);
    const referencesGroup = groupOf(LSP_REFERENCES_ID);

    expect(sideGroup).not.toBeNull();
    expect(referencesGroup).not.toBe(sideGroup);
    expect(sideGroup?.contains(referencesGroup ?? null)).toBe(true);
  });

  it('opens at the width from the design on first visit', () => {
    renderLayout({ referencesContent: REFERENCES });

    expect(lspReferencesHandle().state.sizePx).toBe(312);
  });

  it('unmounts the column when there is nothing to show', () => {
    const { rerender } = renderLayout({ referencesContent: REFERENCES });
    expect(isLspReferencesMounted()).toBe(true);

    rerender(layoutElement());

    expect(isLspReferencesMounted()).toBe(false);
  });

  /**
   * A drag on the column's own border stops at `minSize`. It can only do that
   * because the panel is not collapsible: the library snaps a collapsible panel
   * shut once a drag takes it past halfway to its collapsed size, and this
   * column's collapsed size was 0 — so dragging it narrow shut it and left the
   * panel open but invisible, with no way back short of closing and reopening.
   */
  it('has a minimum width and cannot be collapsed by a drag', () => {
    renderLayout({ referencesContent: REFERENCES });

    const props = lspReferencesEntry().props;
    expect(props.minSize).toBe(200);
    expect(props.collapsible).toBeFalsy();
    expect(props.collapsedSize).toBeUndefined();
    // No cap: the 600px that used to be here answered to no design.
    expect(props.maxSize).toBeUndefined();
  });

  it('restores a stored width', () => {
    localStorage.setItem(
      panelStorageKey(LSP_REFERENCES_ID),
      JSON.stringify(420),
    );
    renderLayout({ referencesContent: REFERENCES });

    expect(lspReferencesHandle().state.sizePx).toBe(420);
  });

  it('persists its own width, keyed globally rather than per app', () => {
    vi.useFakeTimers();
    renderLayout({ referencesContent: REFERENCES });

    act(() => {
      lspReferencesHandle().resize(360);
      lspReferencesEntry().onResize?.();
      vi.advanceTimersByTime(300);
    });

    expect(lspReferencesSize()).toBe(360);
  });

  /**
   * The width has to come back on the *next open in the same session* too, not
   * only after a restart. `sizeAtMount` is read once when the layout mounts, so
   * reading it there handed the user back the width the session started with;
   * the column reads `getLatestSize()` instead, which tracks the latest write
   * ahead of its debounce.
   */
  it('reopens at the width the user last dragged to, without a restart', () => {
    vi.useFakeTimers();
    const { rerender } = renderLayout({ referencesContent: REFERENCES });

    act(() => {
      lspReferencesHandle().resize(430);
      lspReferencesEntry().onResize?.();
    });
    rerender(layoutElement());
    rerender(layoutElement({ referencesContent: REFERENCES }));

    expect(lspReferencesHandle().state.sizePx).toBe(430);
  });

  /**
   * And the width it opens at stays put while it is open: `defaultSize` is a
   * registration prop, so a live value there would re-register the panel — and
   * so re-lay-out the group — on every write.
   */
  it('does not change the width it opened at while it is open', () => {
    vi.useFakeTimers();
    const { rerender } = renderLayout({ referencesContent: REFERENCES });

    act(() => {
      lspReferencesHandle().resize(430);
      lspReferencesEntry().onResize?.();
    });
    rerender(layoutElement({ referencesContent: REFERENCES }));

    expect(lspReferencesEntry().props.defaultSize).toBe(312);
  });
});

/**
 * The references column and the file tree compete for the same
 * horizontal space, so opening the column collapses the tree — but only the
 * collapse we caused may be undone, and it must not be mistaken for the user's
 * own choice of width.
 */
describe('WorkspaceLayout references auto-collapse', () => {
  it('collapses the side panel when the references column opens', () => {
    const { rerender } = renderLayout();
    expect(sideHandle().isCollapsed()).toBe(false);

    rerender(layoutElement({ referencesContent: REFERENCES }));

    expect(sideHandle().isCollapsed()).toBe(true);
  });

  it('re-expands the side panel when the references column closes', () => {
    const { rerender } = renderLayout();

    rerender(layoutElement({ referencesContent: REFERENCES }));
    expect(sideHandle().isCollapsed()).toBe(true);

    rerender(layoutElement());

    expect(sideHandle().isCollapsed()).toBe(false);
    expect(sideHandle().state.sizePx).toBe(216);
  });

  it('leaves a side panel the user had already collapsed collapsed', () => {
    storeSideSize(44);
    const { rerender } = renderLayout();
    expect(sideHandle().isCollapsed()).toBe(true);

    rerender(layoutElement({ referencesContent: REFERENCES }));
    rerender(layoutElement());

    expect(sideHandle().isCollapsed()).toBe(true);
  });

  it('does not overwrite the remembered side width with the collapsed one', () => {
    // The regression this guards: persisting 44px would make the next session
    // boot with the sidebar shut and the user's real width gone — caused by our
    // collapse, not theirs.
    vi.useFakeTimers();
    storeSideSize(260);
    const { rerender } = renderLayout();

    act(() => {
      rerender(layoutElement({ referencesContent: REFERENCES }));
      sideEntry().onResize?.();
      vi.advanceTimersByTime(300);
    });

    expect(sideHandle().isCollapsed()).toBe(true);
    expect(readSideSize()).toBe(260);
  });

  it('still persists a collapse the user asked for', () => {
    vi.useFakeTimers();
    renderLayout();

    act(() => {
      sideHandle().collapse();
      sideEntry().onResize?.();
      vi.advanceTimersByTime(300);
    });

    expect(readSideSize()).toBe(44);
  });

  /**
   * The column is not sized imperatively at all any more — it mounts at its
   * `defaultSize`. What has to survive that mount is the sidebar collapse: a
   * mounting `Panel` makes its group recompute the layout from every panel's
   * `defaultSize`, which is what used to discard a collapse issued in the same
   * commit. It cannot reach the sidebar now, because the two are in different
   * groups — the point of the nesting.
   */
  it('collapses the side panel in the commit the column mounts in', () => {
    const { rerender } = renderLayout();

    rerender(layoutElement({ referencesContent: REFERENCES }));

    expect(isLspReferencesMounted()).toBe(true);
    expect(sideHandle().isCollapsed()).toBe(true);
    expect(lspReferencesHandle().resize).not.toHaveBeenCalled();
  });
});

/**
 * Opening the file tree while the column is showing says the user wants both,
 * so the column stops taking the tree's space away from then on — including
 * after a restart.
 */
describe('WorkspaceLayout references auto-collapse override', () => {
  /** The user opening the file tree themselves. */
  const openSidePanel = (): void => {
    act(() => {
      sideHandle().expand();
      sideEntry().onResize?.();
    });
  };

  it('stops collapsing a side panel the user opened while the column was showing', () => {
    const { rerender } = renderLayout();
    rerender(layoutElement({ referencesContent: REFERENCES }));
    expect(sideHandle().isCollapsed()).toBe(true);

    openSidePanel();

    rerender(layoutElement());
    rerender(layoutElement({ referencesContent: REFERENCES }));

    expect(sideHandle().isCollapsed()).toBe(false);
  });

  it('remembers the override for the next session', () => {
    const first = renderLayout();
    first.rerender(layoutElement({ referencesContent: REFERENCES }));
    openSidePanel();
    first.unmount();

    const second = renderLayout();
    second.rerender(layoutElement({ referencesContent: REFERENCES }));

    expect(sideHandle().isCollapsed()).toBe(false);
  });

  it('remembers the side width again once the override is in force', () => {
    vi.useFakeTimers();
    const { rerender } = renderLayout();
    rerender(layoutElement({ referencesContent: REFERENCES }));
    openSidePanel();

    act(() => {
      sideHandle().resize(300);
      sideEntry().onResize?.();
      vi.advanceTimersByTime(300);
    });

    expect(readSideSize()).toBe(300);
  });

  /**
   * The two false positives that would switch the auto-collapse off before the
   * user had ever asked: our own restore when the column closes, and the file
   * tree's collapse button being used in ordinary work.
   */
  it('does not read the restore on close as the user opening the tree', () => {
    const { rerender } = renderLayout();
    rerender(layoutElement({ referencesContent: REFERENCES }));

    rerender(layoutElement());
    expect(sideHandle().isCollapsed()).toBe(false);

    rerender(layoutElement({ referencesContent: REFERENCES }));

    expect(sideHandle().isCollapsed()).toBe(true);
  });

  it('ignores the tree being collapsed and opened while the column is closed', () => {
    const { rerender } = renderLayout();

    act(() => {
      sideHandle().collapse();
      sideEntry().onResize?.();
    });
    openSidePanel();

    rerender(layoutElement({ referencesContent: REFERENCES }));

    expect(sideHandle().isCollapsed()).toBe(true);
  });
});
