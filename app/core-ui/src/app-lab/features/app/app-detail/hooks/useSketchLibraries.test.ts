/**
 * The installed-libraries list follows `hasSketch`, and a failed or silent
 * library search ends as an error. The daemon calls are stubbed.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  LIBRARY_SEARCH_TIMEOUT_MS,
  useSketchLibraries,
} from './useSketchLibraries';

const h = vi.hoisted(() => ({
  getAppSketchLibraries: vi.fn(),
  getSketchLibraries: vi.fn(),
}));

vi.mock(
  '@cloud-editor-mono/domain/src/services/services-by-app/app-lab',
  () => ({
    getAppSketchLibraries: h.getAppSketchLibraries,
    getSketchLibraries: h.getSketchLibraries,
    addAppSketchLibrary: vi.fn(),
    deleteAppSketchLibrary: vi.fn(),
  }),
);

const APP_ID = 'app-1';

type Props = { hasSketch: boolean | undefined };

const renderLibraries = (
  initial: Props,
): ReturnType<
  typeof renderHook<ReturnType<typeof useSketchLibraries>, Props>
> => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderHook(
    ({ hasSketch }: Props) => useSketchLibraries({ appId: APP_ID, hasSketch }),
    {
      initialProps: initial,
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children),
    },
  );
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useSketchLibraries', () => {
  it('sends no libraries request without a sketch', async () => {
    const { result } = renderLibraries({ hasSketch: false });

    await Promise.resolve();
    expect(h.getAppSketchLibraries).not.toHaveBeenCalled();
    expect(result.current.appLibraries).toBeUndefined();
  });

  it('drops the installed list when the sketch goes away', async () => {
    h.getAppSketchLibraries.mockResolvedValue({ libraries: ['Servo@1.3.0'] });
    const { result, rerender } = renderLibraries({ hasSketch: true });
    await waitFor(() =>
      expect(result.current.appLibraries).toEqual([
        { id: 'Servo', version: '1.3.0' },
      ]),
    );

    rerender({ hasSketch: false });

    expect(result.current.appLibraries).toBeUndefined();
    expect(result.current.appLibrariesById).toEqual({});
    expect(h.getAppSketchLibraries).toHaveBeenCalledTimes(1);
  });

  it('does not show the old list while a re-added sketch loads its own', async () => {
    h.getAppSketchLibraries.mockResolvedValueOnce({
      libraries: ['Servo@1.3.0'],
    });
    const { result, rerender } = renderLibraries({ hasSketch: true });
    await waitFor(() => expect(result.current.appLibraries).toHaveLength(1));

    rerender({ hasSketch: false });

    let resolveSecond: (value: { libraries: string[] }) => void = () =>
      undefined;
    h.getAppSketchLibraries.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSecond = resolve;
      }),
    );
    rerender({ hasSketch: true });
    await waitFor(() =>
      expect(h.getAppSketchLibraries).toHaveBeenCalledTimes(2),
    );
    expect(result.current.appLibraries).toBeUndefined();

    resolveSecond({ libraries: [] });
    await waitFor(() => expect(result.current.appLibraries).toEqual([]));
  });

  it('keeps the installed list while the sketch folder listing is unknown', async () => {
    h.getAppSketchLibraries.mockResolvedValue({ libraries: ['Servo@1.3.0'] });
    const { result, rerender } = renderLibraries({ hasSketch: true });
    await waitFor(() => expect(result.current.appLibraries).toHaveLength(1));

    rerender({ hasSketch: undefined });

    expect(result.current.appLibraries).toEqual([
      { id: 'Servo', version: '1.3.0' },
    ]);
    expect(result.current.appLibrariesById).toEqual({ Servo: '1.3.0' });
  });

  describe('library search', () => {
    const LIBRARY = { id: 'Servo', name: 'Servo' };

    it('reports an error when the search request fails', async () => {
      h.getSketchLibraries.mockRejectedValue(new Error('no internet'));
      const { result } = renderLibraries({ hasSketch: true });

      act(() => result.current.searchSketchLibraries({}));

      await waitFor(() => expect(result.current.librarySearchError).toBe(true));
      expect(result.current.librarySearchIsLoading).toBe(false);
    });

    it('reports an error when the search gets no reply in time', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      h.getSketchLibraries.mockReturnValue(new Promise(() => undefined));
      const { result } = renderLibraries({ hasSketch: true });

      act(() => result.current.searchSketchLibraries({}));
      await waitFor(() =>
        expect(result.current.librarySearchIsLoading).toBe(true),
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(LIBRARY_SEARCH_TIMEOUT_MS);
      });

      await waitFor(() => expect(result.current.librarySearchError).toBe(true));
      expect(result.current.librarySearchIsLoading).toBe(false);
    });

    it('shows loading again on retry and clears the error on success', async () => {
      h.getSketchLibraries.mockRejectedValueOnce(new Error('no internet'));
      const { result } = renderLibraries({ hasSketch: true });
      act(() => result.current.searchSketchLibraries({}));
      await waitFor(() => expect(result.current.librarySearchError).toBe(true));

      let resolveRetry: (value: unknown) => void = () => undefined;
      h.getSketchLibraries.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveRetry = resolve;
        }),
      );
      act(() => result.current.retryLibrarySearch());
      await waitFor(() =>
        expect(result.current.librarySearchIsLoading).toBe(true),
      );

      resolveRetry({ libraries: [LIBRARY] });
      await waitFor(() => expect(result.current.libraries).toEqual([LIBRARY]));
      expect(result.current.librarySearchError).toBe(false);
      expect(result.current.librarySearchIsLoading).toBe(false);
    });
  });
});
