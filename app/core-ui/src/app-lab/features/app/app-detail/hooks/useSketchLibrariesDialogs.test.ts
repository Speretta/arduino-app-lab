/**
 * When the add-library dialog may open, and when an open one closes.
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useAddSketchLibraryDialog } from './useSketchLibrariesDialogs';

vi.mock('../../../../store/boardLifecycle', () => ({
  useBoardLifecycleStore: (): undefined => undefined,
}));

type Props = { blocked: boolean; closeOpenDialog: boolean };

const renderDialog = (
  initial: Props,
): ReturnType<
  typeof renderHook<ReturnType<typeof useAddSketchLibraryDialog>, Props>
> =>
  renderHook(
    (props: Props) =>
      useAddSketchLibraryDialog({
        ...props,
        libraries: [],
        librarySearchIsLoading: false,
        librarySearchError: false,
        retryLibrarySearch: vi.fn(),
        searchSketchLibraries: vi.fn(),
        appLibrariesById: {},
        addSketchLibrary: vi.fn(),
        deleteSketchLibrary: vi.fn(),
        openExternalLink: vi.fn(),
      }),
    { initialProps: initial },
  );

const isOpen = (result: ReturnType<typeof renderDialog>['result']): boolean =>
  result.current.dialogLogic().open;

describe('useAddSketchLibraryDialog', () => {
  it('does not open while blocked', () => {
    const { result } = renderDialog({ blocked: true, closeOpenDialog: false });

    act(() => result.current.openDialog());

    expect(isOpen(result)).toBe(false);
  });

  it('stays open when it becomes blocked, for example after one failed poll', () => {
    const { result, rerender } = renderDialog({
      blocked: false,
      closeOpenDialog: false,
    });
    act(() => result.current.openDialog());

    rerender({ blocked: true, closeOpenDialog: false });

    expect(isOpen(result)).toBe(true);
  });

  it('closes when the sketch is known to be gone', () => {
    const { result, rerender } = renderDialog({
      blocked: false,
      closeOpenDialog: false,
    });
    act(() => result.current.openDialog());

    rerender({ blocked: true, closeOpenDialog: true });

    expect(isOpen(result)).toBe(false);
  });
});
