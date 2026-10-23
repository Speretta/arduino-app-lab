/**
 * The OS import's duplicate check. The file tree is listed lazily, so the
 * check is resolved by the consumer against the backend: a name already taken
 * inside a folder that was never opened is invisible to the tree, and the
 * import would overwrite it with no dialog.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useImportResource } from './useImportResource';

const h = vi.hoisted(() => ({
  eventsEmit: vi.fn(),
  importDroppedResourceToApp: vi.fn((): (() => void) => (): void => undefined),
  snackbar: vi.fn(),
}));

vi.mock(
  '@cloud-editor-mono/domain/src/services/services-by-app/app-lab',
  () => ({
    eventsEmit: h.eventsEmit,
    importDroppedResourceToApp: h.importDroppedResourceToApp,
  }),
);

vi.mock(
  '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab',
  () => ({
    importResourceDialogMessages: { uploadFailedStorageFullApp: { id: 'x' } },
    ImportStatus: {
      Idle: 'idle',
      Uploading: 'uploading',
      UploadFailed: 'fail',
    },
    snackbar: h.snackbar,
    useI18n: (): { formatMessage: (m: { id: string }) => string } => ({
      formatMessage: (m: { id: string }): string => m.id,
    }),
  }),
);

type Props = Parameters<typeof useImportResource>[0];

const importResourceFromPath = vi.fn(() =>
  Promise.resolve({ id: 'id', name: 'notes.md' }),
);
const onDuplicateConflict = vi.fn();

const renderImport = (
  checkPathConflict: Props['checkPathConflict'],
): ReturnType<
  typeof renderHook<ReturnType<typeof useImportResource>, unknown>
> =>
  renderHook(
    () =>
      useImportResource({
        importResourceDialogOpen: true,
        setImportResourceDialogOpen: vi.fn(),
        setImportedResourceId: vi.fn(),
        selectResourcePath: () => Promise.resolve('/host/notes.md'),
        importResourceFromPath,
        type: 'file',
        invalidateQueries: vi.fn(),
        checkPathConflict,
        targetFolderPath: 'python',
        onDuplicateConflict,
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(
          QueryClientProvider,
          { client: new QueryClient() },
          children,
        ),
    },
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useImportResource duplicate check', () => {
  it('imports when the backend says the name is free', async () => {
    const checkPathConflict = vi.fn(() =>
      Promise.resolve({ hasDuplicate: false, conflictType: null }),
    );
    const { result } = renderImport(checkPathConflict);

    await result.current().startImport();

    expect(checkPathConflict).toHaveBeenCalledWith('python/notes.md', 'file');
    expect(importResourceFromPath).toHaveBeenCalled();
  });

  it('raises the conflict dialog instead of importing when it is taken', async () => {
    const checkPathConflict = vi.fn(() =>
      Promise.resolve({
        hasDuplicate: true,
        conflictType: 'file-file' as const,
      }),
    );
    const { result } = renderImport(checkPathConflict);

    await result.current().startImport();

    expect(importResourceFromPath).not.toHaveBeenCalled();
    expect(onDuplicateConflict).toHaveBeenCalledWith(
      expect.objectContaining({
        targetPath: 'python/notes.md',
        conflictType: 'file-file',
        isExternalImport: true,
      }),
    );
  });

  it('aborts the import when the check fails', async () => {
    const checkPathConflict = vi.fn(() => Promise.reject(new Error('offline')));
    const { result } = renderImport(checkPathConflict);

    await result.current().startImport();

    expect(importResourceFromPath).not.toHaveBeenCalled();
    expect(onDuplicateConflict).not.toHaveBeenCalled();
  });
});
