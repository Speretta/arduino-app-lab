/**
 * Unit tests for useAppFileTree. The domain listing service is stubbed so these
 * cover only the hook: which directories it lists, how listings are grafted
 * into the tree, and what invalidation refetches.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { appDirKey, useAppFileTree } from './useAppFileTree';

const h = vi.hoisted(() => ({
  listAppDirectory: vi.fn(),
  statAppPath: vi.fn(),
}));

vi.mock(
  '@cloud-editor-mono/domain/src/services/services-by-app/app-lab',
  () => ({
    listAppDirectory: h.listAppDirectory,
    statAppPath: h.statAppPath,
  }),
);

const APP_ID = 'app-1';
const APP_PATH = '/apps/foo';

const file = (path: string): Record<string, unknown> => ({
  name: path.split('/').pop(),
  path,
  type: 'file',
  extension: '.py',
  mimeType: 'text/x-python',
});

const folder = (path: string): Record<string, unknown> => ({
  name: path.split('/').pop(),
  path,
  type: 'folder',
  children: [],
});

// One listing per directory, mirroring the backend's shallow response.
let listings: Record<string, unknown[]>;

const resetListings = (): void => {
  listings = {
    '': [folder('python'), file('README.md')],
    python: [file('python/main.py'), folder('python/lib')],
    'python/lib': [file('python/lib/util.py')],
  };
};

// The client of the tree most recently rendered, for asserting on the cache.
let client: QueryClient;

const renderTree = (
  onListError?: (relDir: string, error: unknown) => void,
): ReturnType<
  typeof renderHook<ReturnType<typeof useAppFileTree>, unknown>
> => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return renderHook(
    () => useAppFileTree({ appId: APP_ID, appPath: APP_PATH, onListError }),
    {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children),
    },
  );
};

const expandPythonLib = async (result: {
  current: ReturnType<typeof useAppFileTree>;
}): Promise<void> => {
  act(() => result.current.revealPath('python/lib/util.py'));
  await waitFor(() =>
    expect(result.current.findFileNode('python/lib/util.py')).toBeDefined(),
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  resetListings();
  h.listAppDirectory.mockImplementation(
    async (_appPath: string, relDir = '') => listings[relDir] ?? [],
  );
  h.statAppPath.mockResolvedValue({ isDir: true });
});

describe('useAppFileTree', () => {
  it('lists only the root until a folder is expanded', async () => {
    const { result } = renderTree();

    await waitFor(() => expect(result.current.fileTree).toBeDefined());

    expect(h.listAppDirectory).toHaveBeenCalledTimes(1);
    expect(h.listAppDirectory).toHaveBeenCalledWith(APP_PATH, '');
    expect(result.current.fileTree?.map((n) => n.path)).toEqual([
      'python',
      'README.md',
    ]);
  });

  it('leaves an unexpanded folder unlisted rather than empty', async () => {
    const { result } = renderTree();

    await waitFor(() => expect(result.current.fileTree).toBeDefined());

    expect(result.current.fileTree?.[0]).toMatchObject({
      type: 'folder',
      children: null,
    });
  });

  it('grafts a folder\u2019s children in once it is expanded', async () => {
    const { result } = renderTree();
    await waitFor(() => expect(result.current.fileTree).toBeDefined());

    act(() => result.current.expandDir('python'));

    await waitFor(() =>
      expect(result.current.fileTree?.[0]).not.toMatchObject({
        children: null,
      }),
    );

    const python = result.current.fileTree?.[0];
    expect(python).toMatchObject({ type: 'folder' });
    if (python?.type !== 'folder') throw new Error('expected a folder');

    expect(python.children?.map((c) => c.path)).toEqual([
      'python/main.py',
      'python/lib',
    ]);
    // The grandchild folder is present but still unlisted.
    expect(python.children?.[1]).toMatchObject({ children: null });
    expect(h.listAppDirectory).toHaveBeenCalledWith(APP_PATH, 'python');
  });

  it('nests a directory expanded below another', async () => {
    const { result } = renderTree();
    await waitFor(() => expect(result.current.fileTree).toBeDefined());

    act(() => result.current.expandDir('python'));
    await waitFor(() =>
      expect(result.current.fileTree?.[0]).not.toMatchObject({
        children: null,
      }),
    );

    act(() => result.current.expandDir('python/lib'));
    await waitFor(() =>
      expect(h.listAppDirectory).toHaveBeenCalledWith(APP_PATH, 'python/lib'),
    );

    await waitFor(() => {
      const python = result.current.fileTree?.[0];
      if (python?.type !== 'folder') throw new Error('expected a folder');
      expect(python.children?.[1]).not.toMatchObject({ children: null });
    });
  });

  it('does not re-list a directory that is already expanded', async () => {
    const { result } = renderTree();
    await waitFor(() => expect(result.current.fileTree).toBeDefined());

    act(() => result.current.expandDir('python'));
    await waitFor(() =>
      expect(result.current.fileTree?.[0]).not.toMatchObject({
        children: null,
      }),
    );

    const callsAfterFirstExpand = h.listAppDirectory.mock.calls.length;
    act(() => result.current.expandDir('python'));

    expect(h.listAppDirectory.mock.calls.length).toBe(callsAfterFirstExpand);
  });

  it('keeps the tree referentially stable across re-renders', async () => {
    const { result, rerender } = renderTree();
    await waitFor(() => expect(result.current.fileTree).toBeDefined());

    const before = result.current.fileTree;
    rerender();

    expect(result.current.fileTree).toBe(before);
  });

  it('re-lists only the directory holding a changed path', async () => {
    const { result } = renderTree();
    await waitFor(() => expect(result.current.fileTree).toBeDefined());

    act(() => result.current.expandDir('python'));
    await waitFor(() =>
      expect(result.current.fileTree?.[0]).not.toMatchObject({
        children: null,
      }),
    );

    listings.python = [...listings.python, file('python/added.py')];
    h.listAppDirectory.mockClear();

    act(() => result.current.invalidateDirs(['python/added.py']));

    await waitFor(() => {
      const python = result.current.fileTree?.[0];
      if (python?.type !== 'folder') throw new Error('expected a folder');
      expect(python.children?.map((c) => c.path)).toContain('python/added.py');
    });

    expect(
      h.listAppDirectory.mock.calls.every(([, relDir]) => relDir === 'python'),
    ).toBe(true);
  });

  // A folder deleted and recreated must not serve what it held before.
  it('unlists a folder and everything under it', async () => {
    const { result } = renderTree();
    await waitFor(() => expect(result.current.fileTree).toBeDefined());

    act(() => result.current.revealPath('python/lib/util.py'));
    await waitFor(() =>
      expect(result.current.findFileNode('python/lib/util.py')).toBeDefined(),
    );

    act(() => result.current.unlistDir('python'));

    await waitFor(() =>
      expect(result.current.fileTree?.[0]).toMatchObject({ children: null }),
    );
    expect(result.current.findFileNode('python/lib/util.py')).toBeUndefined();
  });

  // A folder replaced in one step (`mv sub sub_moved && mkdir sub`) reaches the
  // hook as a bare create, with the folder still on screen.
  describe('relistDir', () => {
    const expandDeep = async (result: {
      current: ReturnType<typeof useAppFileTree>;
    }): Promise<void> => {
      act(() => result.current.expandDir('python/lib/deep'));
      await waitFor(() =>
        expect(
          result.current.findFileNode('python/lib/deep/inner.py'),
        ).toBeDefined(),
      );
    };

    beforeEach(() => {
      listings['python/lib'] = [
        ...listings['python/lib'],
        folder('python/lib/deep'),
      ];
      listings['python/lib/deep'] = [file('python/lib/deep/inner.py')];
    });

    it('refetches the folder and drops the listings under it', async () => {
      const { result } = renderTree();
      await waitFor(() => expect(result.current.fileTree).toBeDefined());
      await expandPythonLib(result);
      await expandDeep(result);

      // Same name on disk, different folder behind it.
      listings['python/lib'] = [file('python/lib/other.py')];
      delete listings['python/lib/deep'];
      h.listAppDirectory.mockClear();

      act(() => result.current.relistDir('python/lib'));

      await waitFor(() =>
        expect(
          result.current.findFileNode('python/lib/other.py'),
        ).toBeDefined(),
      );
      // Still listed — it refetched instead of waiting to be reopened — and
      // nothing under it survived or was asked for again.
      expect(h.listAppDirectory.mock.calls.map(([, relDir]) => relDir)).toEqual(
        ['python/lib'],
      );
      expect(
        client.getQueryData(appDirKey(APP_ID, 'python/lib/deep')),
      ).toBeUndefined();
      expect(
        result.current.findFileNode('python/lib/deep/inner.py'),
      ).toBeUndefined();
    });

    // The same event fires for a plain file create, and for a folder nobody
    // has opened.
    it('does nothing for a path the tree does not list', async () => {
      const { result } = renderTree();
      await waitFor(() => expect(result.current.fileTree).toBeDefined());
      h.listAppDirectory.mockClear();

      act(() => result.current.relistDir('README.md'));
      act(() => result.current.relistDir('python'));
      act(() => result.current.relistDir(''));

      expect(h.listAppDirectory).not.toHaveBeenCalled();
      expect(result.current.fileTree?.map((n) => n.path)).toEqual([
        'python',
        'README.md',
      ]);
    });
  });

  it('has no tree when the root listing fails', async () => {
    h.listAppDirectory.mockRejectedValue(new Error('gone'));
    const { result } = renderTree();

    await waitFor(() => expect(result.current.rootFailed).toBe(true));
    expect(result.current.fileTree).toBeUndefined();
  });

  it('lists every ancestor of a revealed path', async () => {
    const { result } = renderTree();
    await waitFor(() => expect(result.current.fileTree).toBeDefined());

    act(() => result.current.revealPath('python/lib/util.py'));

    await waitFor(() => {
      const python = result.current.fileTree?.[0];
      if (python?.type !== 'folder') throw new Error('expected a folder');
      expect(python.children?.[1]).toMatchObject({
        path: 'python/lib',
        children: [{ path: 'python/lib/util.py' }],
      });
    });
  });

  it('lists nothing extra for a path already at the root', async () => {
    const { result } = renderTree();
    await waitFor(() => expect(result.current.fileTree).toBeDefined());

    act(() => result.current.revealPath('README.md'));

    expect(h.listAppDirectory).toHaveBeenCalledTimes(1);
  });

  // A `file://` id splits into "file:", "file:/", "file://" ... none of which
  // are directories of this app.
  it.each(['/apps/other/main.py', 'file:///Users/me/scratch.md'])(
    'lists no directory for the external id %j',
    async (externalId) => {
      const { result } = renderTree();
      await waitFor(() => expect(result.current.fileTree).toBeDefined());

      act(() => result.current.revealPath(externalId));

      expect(h.listAppDirectory).toHaveBeenCalledTimes(1);
    },
  );

  // Callers look the node up straight after revealing it, so the lookup has to
  // stay wrong-but-harmless until the listings it depends on arrive.
  it('finds a revealed path only once its ancestors have been listed', async () => {
    const buried = 'python/lib/util.py';
    const { result } = renderTree();
    await waitFor(() => expect(result.current.fileTree).toBeDefined());

    act(() => result.current.revealPath(buried));
    expect(result.current.findFileNode(buried)).toBeUndefined();

    await waitFor(() =>
      expect(result.current.findFileNode(buried)).toMatchObject({
        path: buried,
        type: 'file',
      }),
    );
  });

  it('does not mistake a folder for a file', async () => {
    const { result } = renderTree();
    await waitFor(() => expect(result.current.fileTree).toBeDefined());

    expect(result.current.findFileNode('python')).toBeUndefined();
    expect(result.current.findFileNode('README.md')).toMatchObject({
      path: 'README.md',
    });
  });

  // A folder renamed in the UI keeps its rows: the listing has to move with it,
  // and the old key must not survive to furnish whatever next takes that name.
  it('carries expansion across a rename and forgets the old listing', async () => {
    const { result } = renderTree();
    await waitFor(() => expect(result.current.fileTree).toBeDefined());
    await expandPythonLib(result);

    listings.py3 = listings.python;
    listings['py3/lib'] = listings['python/lib'];
    h.listAppDirectory.mockClear();

    act(() => result.current.renameDir('python', 'py3'));

    await waitFor(() =>
      expect(h.listAppDirectory).toHaveBeenCalledWith(APP_PATH, 'py3'),
    );
    await waitFor(() =>
      expect(h.listAppDirectory).toHaveBeenCalledWith(APP_PATH, 'py3/lib'),
    );
    expect(client.getQueryData(appDirKey(APP_ID, 'python'))).toBeUndefined();
    expect(
      client.getQueryData(appDirKey(APP_ID, 'python/lib')),
    ).toBeUndefined();
  });

  it('drops a collapsed folder and its open subfolders', async () => {
    const { result } = renderTree();
    await waitFor(() => expect(result.current.fileTree).toBeDefined());
    await expandPythonLib(result);

    act(() => result.current.collapseDir('python'));

    await waitFor(() =>
      expect(result.current.fileTree?.[0]).toMatchObject({ children: null }),
    );

    // Nothing under the closed folder is listed any more, so a change to the
    // app refetches only what is on screen.
    h.listAppDirectory.mockClear();
    act(() => result.current.invalidateDirs());
    await waitFor(() => expect(h.listAppDirectory).toHaveBeenCalled());
    expect(
      h.listAppDirectory.mock.calls.every(([, relDir]) => relDir === ''),
    ).toBe(true);
  });

  describe('a directory that fails to list', () => {
    // Expands `python` on a backend that cannot read it, and waits for the
    // failure to have been reported.
    const failPython = async (): Promise<{
      rendered: ReturnType<typeof renderTree>;
      onListError: ReturnType<typeof vi.fn>;
    }> => {
      const onListError = vi.fn();
      const rendered = renderTree(onListError);
      await waitFor(() =>
        expect(rendered.result.current.fileTree).toBeDefined(),
      );

      delete listings.python;
      h.listAppDirectory.mockImplementation(async (_p: string, relDir = '') => {
        if (relDir === 'python') throw new Error('unreadable');
        return listings[relDir] ?? [];
      });

      act(() => rendered.result.current.expandDir('python'));
      await waitFor(() => expect(onListError).toHaveBeenCalled());
      return { rendered, onListError };
    };

    it('reports it and leaves the folder unlisted rather than empty', async () => {
      const { rendered, onListError } = await failPython();

      expect(onListError.mock.calls[0][0]).toBe('python');
      expect(rendered.result.current.fileTree?.[0]).toMatchObject({
        children: null,
      });
    });

    // The row stays open over the dropped listing until the tree is told to
    // close it, so the folder has to be named — and named again on a repeat.
    it('reports the folder, with a new value each failure', async () => {
      const { rendered } = await failPython();
      const { result } = rendered;

      expect(result.current.listFailure).toEqual({ path: 'python', seq: 1 });

      act(() => result.current.expandDir('python'));
      await waitFor(() =>
        expect(result.current.listFailure).toEqual({ path: 'python', seq: 2 }),
      );
    });

    // A custom brick rename moves `bricks/<id>` on the board and then
    // invalidates every listing, so the open brick folder refetches a path
    // that no longer exists.
    describe('because it was moved away while listed', () => {
      const movePythonAway = async (): Promise<{
        result: ReturnType<typeof renderTree>['result'];
        onListError: ReturnType<typeof vi.fn>;
      }> => {
        const onListError = vi.fn();
        const { result } = renderTree(onListError);
        await waitFor(() => expect(result.current.fileTree).toBeDefined());
        act(() => result.current.expandDir('python'));
        await waitFor(() =>
          expect(result.current.fileTree?.[0]).not.toMatchObject({
            children: null,
          }),
        );

        listings[''] = [folder('python_moved'), file('README.md')];
        delete listings.python;
        h.listAppDirectory.mockImplementation(
          async (_p: string, relDir = '') => {
            const listing = listings[relDir];
            if (!listing) throw new Error('No such file or directory');
            return listing;
          },
        );

        act(() => result.current.invalidateDirs());
        await waitFor(() =>
          expect(result.current.listFailure).toEqual({
            path: 'python',
            seq: 1,
          }),
        );
        await waitFor(() =>
          expect(h.statAppPath).toHaveBeenCalledWith(`${APP_PATH}/python`),
        );
        return { result, onListError };
      };

      it('drops the folder without reporting it', async () => {
        h.statAppPath.mockResolvedValue(null);
        const { result, onListError } = await movePythonAway();

        await waitFor(() =>
          expect(result.current.fileTree?.map((n) => n.path)).toEqual([
            'python_moved',
            'README.md',
          ]),
        );
        expect(onListError).not.toHaveBeenCalled();
      });

      it('reports it when the stat cannot tell', async () => {
        h.statAppPath.mockRejectedValue(new Error('board unreachable'));
        const { onListError } = await movePythonAway();

        await waitFor(() => expect(onListError).toHaveBeenCalled());
        expect(onListError.mock.calls[0][0]).toBe('python');
      });
    });

    it('asks again when the folder is expanded a second time', async () => {
      const { rendered } = await failPython();
      const { result } = rendered;

      // The errored listing is gone, so re-opening the folder is a fresh ask.
      await waitFor(() =>
        expect(
          client.getQueryData(appDirKey(APP_ID, 'python')),
        ).toBeUndefined(),
      );

      listings.python = [file('python/main.py')];
      h.listAppDirectory.mockImplementation(
        async (_p: string, relDir = '') => listings[relDir] ?? [],
      );
      act(() => result.current.expandDir('python'));

      await waitFor(() => {
        const python = result.current.fileTree?.[0];
        if (python?.type !== 'folder') throw new Error('expected a folder');
        expect(python.children?.map((c) => c.path)).toEqual(['python/main.py']);
      });
    });
  });

  it('exposes a per-directory query key', () => {
    expect(appDirKey(APP_ID, 'python')).toEqual(['app-dir', APP_ID, 'python']);
  });
});
