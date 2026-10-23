/**
 * useAppHasSketch answers true, false or "cannot tell" from the root listing
 * and the `sketch/` listing. The listing service is stubbed.
 */

import type { TreeNode } from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { appDirKey } from './useAppFileTree';
import { useAppHasSketch } from './useAppHasSketch';

const h = vi.hoisted(() => ({ listAppDirectory: vi.fn() }));

vi.mock(
  '@cloud-editor-mono/domain/src/services/services-by-app/app-lab',
  () => ({ listAppDirectory: h.listAppDirectory }),
);

const APP_ID = 'app-1';
const APP_PATH = '/apps/foo';

const file = (path: string): TreeNode => ({
  name: path.split('/').pop() as string,
  path,
  type: 'file',
  extension: path.split('.').pop() as string,
  mimeType: 'text/plain',
});

const folder = (path: string): TreeNode => ({
  name: path.split('/').pop() as string,
  path,
  type: 'folder',
  children: null,
});

const ROOT_WITH_SKETCH = [folder('python'), folder('sketch'), file('app.yaml')];
const ROOT_WITHOUT_SKETCH = [folder('python'), file('app.yaml')];
const BOTH = [file('sketch/sketch.ino'), file('sketch/sketch.yaml')];

type Props = {
  fileTree?: TreeNode[];
  rootFailed?: boolean;
  boardIsReachable?: boolean;
};

let client: QueryClient;

const renderHasSketch = (
  initial: Props,
): ReturnType<typeof renderHook<boolean | undefined, Props>> => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(
    ({ fileTree, rootFailed = false, boardIsReachable = true }: Props) =>
      useAppHasSketch({
        appId: APP_ID,
        appPath: APP_PATH,
        fileTree,
        rootFailed,
        boardIsReachable,
      }),
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

describe('useAppHasSketch', () => {
  it('is false without a sketch folder, and lists nothing', async () => {
    const { result } = renderHasSketch({ fileTree: ROOT_WITHOUT_SKETCH });

    expect(result.current).toBe(false);
    await act(async () => undefined);
    expect(h.listAppDirectory).not.toHaveBeenCalled();
  });

  it('cannot tell while the root listing loads or after it failed', () => {
    expect(renderHasSketch({}).result.current).toBeUndefined();
    expect(
      renderHasSketch({ fileTree: ROOT_WITH_SKETCH, rootFailed: true }).result
        .current,
    ).toBeUndefined();
  });

  it('cannot tell while the sketch listing loads, then needs both files', async () => {
    let resolve: (nodes: TreeNode[]) => void = () => undefined;
    h.listAppDirectory.mockReturnValueOnce(
      new Promise<TreeNode[]>((r) => (resolve = r)),
    );
    const { result } = renderHasSketch({ fileTree: ROOT_WITH_SKETCH });

    expect(result.current).toBeUndefined();
    expect(h.listAppDirectory).toHaveBeenCalledWith(APP_PATH, 'sketch');

    await act(async () => resolve(BOTH));
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('is false when one of the two files is missing', async () => {
    h.listAppDirectory.mockResolvedValue([file('sketch/sketch.ino')]);
    const { result } = renderHasSketch({ fileTree: ROOT_WITH_SKETCH });

    await waitFor(() => expect(result.current).toBe(false));
  });

  it('cannot tell when the sketch listing failed', async () => {
    h.listAppDirectory.mockRejectedValue(new Error('board unreachable'));
    const { result } = renderHasSketch({ fileTree: ROOT_WITH_SKETCH });

    await waitFor(() => expect(h.listAppDirectory).toHaveBeenCalled());
    await act(async () => undefined);
    expect(result.current).toBeUndefined();
  });

  // The tree observes `sketch/` only while it is expanded; this hook keeps an
  // observer so a watcher invalidation refetches it with the folder closed.
  it('follows an invalidation of the sketch listing', async () => {
    h.listAppDirectory.mockResolvedValue(BOTH);
    const { result } = renderHasSketch({ fileTree: ROOT_WITH_SKETCH });
    await waitFor(() => expect(result.current).toBe(true));

    h.listAppDirectory.mockResolvedValue([file('sketch/sketch.ino')]);
    await act(() =>
      client.invalidateQueries({
        queryKey: appDirKey(APP_ID, 'sketch'),
        exact: true,
      }),
    );

    await waitFor(() => expect(result.current).toBe(false));
  });

  it('lists the sketch again when the board comes back', async () => {
    h.listAppDirectory.mockRejectedValue(new Error('board unreachable'));
    const { result, rerender } = renderHasSketch({
      fileTree: ROOT_WITH_SKETCH,
      boardIsReachable: false,
    });
    await waitFor(() => expect(h.listAppDirectory).toHaveBeenCalledTimes(1));
    await act(async () => undefined);

    h.listAppDirectory.mockResolvedValue(BOTH);
    rerender({ fileTree: ROOT_WITH_SKETCH, boardIsReachable: true });

    await waitFor(() => expect(result.current).toBe(true));
    expect(h.listAppDirectory).toHaveBeenCalledTimes(2);
  });
});
