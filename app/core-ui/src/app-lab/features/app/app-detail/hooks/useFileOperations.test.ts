/**
 * Renaming a folder has to move its listing with it: the file tree keys every
 * listing by its directory's path, so a rename that only invalidates leaves the
 * new folder unlisted and the old key alive to furnish whatever next takes the
 * name.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useFileOperations,
  UseFileOperationsReturn,
} from './useFileOperations';

const h = vi.hoisted(() => ({
  renameAppFile: vi.fn(() => Promise.resolve()),
  getCodeSubjects: (): Map<string, unknown> => new Map(),
}));

vi.mock(
  '@cloud-editor-mono/domain/src/services/services-by-app/app-lab',
  (): Record<string, unknown> => ({
    createAppFile: vi.fn(),
    createAppFolder: vi.fn(),
    getCodeSubjectById: (): never => {
      throw new Error('no subject');
    },
    getCodeSubjects: h.getCodeSubjects,
    removeAppFile: vi.fn(),
    removeCodeSubject: vi.fn(),
    renameAppFile: h.renameAppFile,
    renameCodeSubject: vi.fn(),
    setCodeSubjects: vi.fn(),
  }),
);

const renameDir = vi.fn();
const invalidateDirs = vi.fn();

const renderOps = (): UseFileOperationsReturn => {
  const client = new QueryClient();
  const { result } = renderHook(
    () =>
      useFileOperations({
        appId: 'app-1',
        appPath: '/apps/foo',
        invalidateDirs,
        unlistDir: vi.fn(),
        renameDir,
        fetchFile: vi.fn(() => Promise.resolve()),
        selectFile: vi.fn(),
        closeFile: vi.fn(),
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children),
    },
  );
  return result.current;
};

beforeEach(() => {
  vi.clearAllMocks();
  h.renameAppFile.mockResolvedValue(undefined);
});

describe('useFileOperations.renameFile', () => {
  it('moves the folder listing across on a user rename', async () => {
    await renderOps().renameFile('python', 'py3', { nodeType: 'folder' });

    expect(renameDir).toHaveBeenCalledWith('python', 'py3');
  });

  // The watcher's half of an external rename never touches the backend, but the
  // listing has to move just the same.
  it('moves it across on a stream rename too', async () => {
    await renderOps().renameFile('python', 'py3', {
      nodeType: 'folder',
      source: 'stream',
    });

    expect(h.renameAppFile).not.toHaveBeenCalled();
    expect(renameDir).toHaveBeenCalledWith('python', 'py3');
  });

  it('leaves a file rename alone', async () => {
    await renderOps().renameFile('python/a.py', 'python/b.py', {
      nodeType: 'file',
    });

    expect(renameDir).not.toHaveBeenCalled();
  });

  // The folder is still at its old path, so moving the expansion would unlist a
  // folder that is still on screen.
  it('does not move it when the backend rename fails', async () => {
    h.renameAppFile.mockRejectedValue(new Error('read-only'));

    await expect(
      renderOps().renameFile('python', 'py3', { nodeType: 'folder' }),
    ).rejects.toThrow();
    expect(renameDir).not.toHaveBeenCalled();
  });
});
