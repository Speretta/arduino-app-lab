import { fireEvent, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { describe, expect, it, vi } from 'vitest';

// Browser APIs jsdom lacks: the app-lab barrel this dialog imports from also
// pulls in the serial monitor, which constructs a web worker at import time,
// and the modal's scrollable body observes its parent.
vi.hoisted(() => {
  const noop = (): void => undefined;

  globalThis.Worker = class {
    addEventListener = noop;
    postMessage = noop;
    terminate = noop;
  } as unknown as typeof Worker;

  globalThis.ResizeObserver = class {
    observe = noop;
    unobserve = noop;
    disconnect = noop;
  } as unknown as typeof ResizeObserver;
});

import {
  AddSketchLibraryDialog,
  AddSketchLibraryDialogLogic,
} from './AddSketchLibraryDialog';

type Logic = ReturnType<AddSketchLibraryDialogLogic>;

const renderDialog = (overrides: Partial<Logic> = {}): Logic => {
  const logic: Logic = {
    open: true,
    onOpenChange: vi.fn(),
    libraries: [],
    librarySearchIsLoading: false,
    librarySearchError: false,
    retryLibrarySearch: vi.fn(),
    searchSketchLibraries: vi.fn(),
    appLibrariesById: {},
    addSketchLibrary: vi.fn(),
    deleteSketchLibrary: vi.fn(),
    openExternalLink: vi.fn(),
    ...overrides,
  };
  render(
    <IntlProvider locale="en">
      <AddSketchLibraryDialog logic={(): Logic => logic} />
    </IntlProvider>,
  );
  return logic;
};

describe('AddSketchLibraryDialog', () => {
  it('shows the error and a retry button when the search fails', () => {
    const logic = renderDialog({ librarySearchError: true });

    expect(screen.getByRole('alert').textContent).toContain(
      'Libraries could not be loaded.',
    );
    expect(screen.queryByText('No libraries found')).toBeNull();

    fireEvent.click(screen.getByText('Try again'));
    expect(logic.retryLibrarySearch).toHaveBeenCalledTimes(1);
  });

  it('shows the skeleton, not the error, while a retry runs', () => {
    renderDialog({ librarySearchError: true, librarySearchIsLoading: true });

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows "No libraries found" for an empty result', () => {
    renderDialog();

    expect(screen.getByText('No libraries found')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
