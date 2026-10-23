/**
 * useAddSketch writes only what is missing of `sketch/`, `sketch.ino` and
 * `sketch.yaml`, and removes what it wrote when a write fails: the daemon stops
 * loading an app that holds only one of the two files.
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SKETCH_INO_TEMPLATE,
  SKETCH_YAML_TEMPLATE,
} from '../../../../utils/sketch-file-templates';
import { SketchFileCheckError, useAddSketch } from './useAddSketch';

const h = vi.hoisted(() => ({ statAppPath: vi.fn() }));

vi.mock(
  '@cloud-editor-mono/domain/src/services/services-by-app/app-lab',
  () => ({ statAppPath: h.statAppPath }),
);

const APP_PATH = '/apps/foo';
const DIR = { isDir: true };
const FILE = { isDir: false };

// What exists on the board, by app-relative path. Writes add to it.
let disk: Set<string>;
let failWrite: string | undefined;

const ops = {
  addFolder: vi.fn(async (path: string) => {
    disk.add(path);
  }),
  addFile: vi.fn(
    async (path: string, _n: string, _e: string, _content?: string) => {
      // A failed write still leaves its file behind, as `cat >` does.
      disk.add(path);
      if (path === failWrite) throw new Error('BOARD_STORAGE_FULL');
    },
  ),
  deleteFile: vi.fn(async (path: string) => {
    disk.delete(path);
  }),
  removeFolder: vi.fn(async (path: string) => {
    Array.from(disk)
      .filter((p) => p === path || p.startsWith(`${path}/`))
      .forEach((p) => disk.delete(p));
  }),
  openFile: vi.fn(async () => undefined),
  revealPath: vi.fn(),
  invalidateDirs: vi.fn(),
  onAddSketchError: vi.fn(),
};

const renderAddSketch = (): ReturnType<typeof useAddSketch> =>
  renderHook(() => useAddSketch({ appPath: APP_PATH, ...ops })).result.current;

beforeEach(() => {
  vi.clearAllMocks();
  disk = new Set();
  failWrite = undefined;
  h.statAppPath.mockImplementation(async (full: string) => {
    const rel = full.slice(APP_PATH.length + 1);
    if (!disk.has(rel)) return null;
    return rel === 'sketch' ? DIR : FILE;
  });
});

const writtenPaths = (): string[] => ops.addFile.mock.calls.map(([p]) => p);

describe('useAddSketch addSketch', () => {
  it('creates the folder, then sketch.ino, then sketch.yaml, and opens sketch.ino', async () => {
    const { addSketch } = renderAddSketch();

    await act(() => addSketch());

    expect(ops.addFolder).toHaveBeenCalledWith('sketch');
    expect(ops.addFile.mock.calls).toEqual([
      ['sketch/sketch.ino', 'sketch', 'ino', SKETCH_INO_TEMPLATE],
      ['sketch/sketch.yaml', 'sketch', 'yaml', SKETCH_YAML_TEMPLATE],
    ]);
    expect(ops.openFile).toHaveBeenCalledWith('sketch/sketch.ino');
    expect(ops.revealPath).toHaveBeenCalledWith('sketch/sketch.ino');
    expect(ops.onAddSketchError).not.toHaveBeenCalled();
  });

  it('creates only the missing file and leaves the other alone', async () => {
    disk = new Set(['sketch', 'sketch/sketch.ino']);
    const { addSketch } = renderAddSketch();

    await act(() => addSketch());

    expect(ops.addFolder).not.toHaveBeenCalled();
    expect(writtenPaths()).toEqual(['sketch/sketch.yaml']);
  });

  it('writes nothing when the check fails', async () => {
    h.statAppPath.mockRejectedValue(new Error('board unreachable'));
    const { addSketch } = renderAddSketch();

    await act(() => addSketch());

    expect(ops.addFolder).not.toHaveBeenCalled();
    expect(ops.addFile).not.toHaveBeenCalled();
    expect(ops.onAddSketchError).toHaveBeenCalledTimes(1);
  });

  it('removes the folder it created when a write fails', async () => {
    failWrite = 'sketch/sketch.yaml';
    const { addSketch } = renderAddSketch();

    await act(() => addSketch());

    expect(ops.removeFolder).toHaveBeenCalledWith('sketch');
    expect(disk.size).toBe(0);
    expect(ops.openFile).not.toHaveBeenCalled();
    expect(ops.onAddSketchError).toHaveBeenCalledTimes(1);
  });

  it('keeps a folder that existed and removes only the files it wrote', async () => {
    disk = new Set(['sketch']);
    failWrite = 'sketch/sketch.yaml';
    const { addSketch } = renderAddSketch();

    await act(() => addSketch());

    expect(ops.removeFolder).not.toHaveBeenCalled();
    expect(ops.deleteFile.mock.calls.map(([p]) => p).sort()).toEqual([
      'sketch/sketch.ino',
      'sketch/sketch.yaml',
    ]);
    expect(Array.from(disk)).toEqual(['sketch']);
    expect(ops.onAddSketchError).toHaveBeenCalledTimes(1);
  });

  // Over adb, deleting a path that does not exist fails.
  it('deletes only files that exist after the failed write', async () => {
    disk = new Set(['sketch']);
    failWrite = 'sketch/sketch.ino';
    ops.addFile.mockImplementationOnce(async () => {
      throw new Error('write failed before the file existed');
    });
    const { addSketch } = renderAddSketch();

    await act(() => addSketch());

    expect(ops.deleteFile).not.toHaveBeenCalled();
    expect(ops.onAddSketchError).toHaveBeenCalledTimes(1);
  });

  it('still reports the failure when the rollback fails', async () => {
    failWrite = 'sketch/sketch.yaml';
    ops.removeFolder.mockRejectedValueOnce(new Error('board dropped'));
    const { addSketch } = renderAddSketch();

    await act(() => addSketch());

    expect(ops.onAddSketchError).toHaveBeenCalledTimes(1);
  });

  it('ignores a second run while one is in flight', async () => {
    const { addSketch } = renderAddSketch();

    await act(() => Promise.all([addSketch(), addSketch()]));

    expect(ops.addFolder).toHaveBeenCalledTimes(1);
  });
});

describe('useAddSketch createSketchFile', () => {
  it('writes the requested file, then the missing companion, each with its template', async () => {
    disk = new Set(['sketch']);
    const { createSketchFile } = renderAddSketch();

    await act(() => createSketchFile('sketch/sketch.ino'));

    expect(ops.addFile.mock.calls).toEqual([
      ['sketch/sketch.ino', 'sketch', 'ino', SKETCH_INO_TEMPLATE],
      ['sketch/sketch.yaml', 'sketch', 'yaml', SKETCH_YAML_TEMPLATE],
    ]);
  });

  it('writes no companion that already exists', async () => {
    disk = new Set(['sketch', 'sketch/sketch.ino']);
    const { createSketchFile } = renderAddSketch();

    await act(() => createSketchFile('sketch/sketch.yaml'));

    expect(writtenPaths()).toEqual(['sketch/sketch.yaml']);
  });

  it('removes both files and rethrows when the companion write fails', async () => {
    disk = new Set(['sketch']);
    failWrite = 'sketch/sketch.ino';
    const { createSketchFile } = renderAddSketch();

    await expect(createSketchFile('sketch/sketch.yaml')).rejects.toThrow(
      'BOARD_STORAGE_FULL',
    );

    expect(Array.from(disk)).toEqual(['sketch']);
  });

  it('raises a check error and writes nothing when the companion cannot be checked', async () => {
    h.statAppPath.mockRejectedValue(new Error('board unreachable'));
    const { createSketchFile } = renderAddSketch();

    await expect(createSketchFile('sketch/sketch.ino')).rejects.toThrow(
      SketchFileCheckError,
    );
    expect(ops.addFile).not.toHaveBeenCalled();
  });
});
