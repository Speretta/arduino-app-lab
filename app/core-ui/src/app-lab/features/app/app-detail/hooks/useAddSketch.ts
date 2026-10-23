import { statAppPath } from '@cloud-editor-mono/domain/src/services/services-by-app/app-lab';
import { useCallback, useRef } from 'react';

import {
  SKETCH_INO_TEMPLATE,
  SKETCH_YAML_TEMPLATE,
} from '../../../../utils/sketch-file-templates';
import { splitFileName } from './filePaths';
import { MAIN_SKETCH_PATH, SKETCH_YAML_PATH } from './useAppFiles';
import { SKETCH_DIR } from './useAppHasSketch';
import { UseFileOperationsReturn } from './useFileOperations';

const TEMPLATES: Record<string, string> = {
  [MAIN_SKETCH_PATH]: SKETCH_INO_TEMPLATE,
  [SKETCH_YAML_PATH]: SKETCH_YAML_TEMPLATE,
};

export const isSketchFilePath = (path: string): boolean => path in TEMPLATES;

// Raised when the companion file could not be checked, so nothing was written.
export class SketchFileCheckError extends Error {}

type UseAddSketchParams = {
  appPath?: string;
  addFolder: UseFileOperationsReturn['addFolder'];
  addFile: UseFileOperationsReturn['addFile'];
  deleteFile: UseFileOperationsReturn['deleteFile'];
  removeFolder: UseFileOperationsReturn['removeFolder'];
  openFile: UseFileOperationsReturn['openFile'];
  revealPath: (path: string) => void;
  invalidateDirs: (paths?: string[]) => void;
  onAddSketchError: () => void;
};

type UseAddSketchReturn = {
  addSketch: () => Promise<void>;
  // For `sketch/sketch.ino` and `sketch/sketch.yaml` created by hand. Writes
  // the requested file, then the other one if it is missing, each with its
  // template: an empty sketch.ino does not link.
  createSketchFile: (path: string) => Promise<void>;
};

// The daemon stops loading an app whose `sketch/` holds only one of the two
// files: it disappears from My Apps and cannot start. So a failed run removes
// everything it wrote.
export function useAddSketch({
  appPath,
  addFolder,
  addFile,
  deleteFile,
  removeFolder,
  openFile,
  revealPath,
  invalidateDirs,
  onAddSketchError,
}: UseAddSketchParams): UseAddSketchReturn {
  const runningRef = useRef(false);

  const stat = useCallback(
    (relPath: string) => statAppPath(`${appPath}/${relPath}`),
    [appPath],
  );

  const writeFile = useCallback(
    (path: string, content: string) => {
      const { fileName, fileExtension } = splitFileName(
        path.split('/').pop() ?? '',
      );
      return addFile(path, fileName, fileExtension, content);
    },
    [addFile],
  );

  // Stat before deleting: over adb a missing path makes the delete fail. A
  // failed write can still leave its file behind, so every attempted path is
  // checked.
  const removeFiles = useCallback(
    async (paths: string[]) => {
      const exists = await Promise.all(paths.map((path) => stat(path)));
      for (const [index, path] of paths.entries()) {
        if (exists[index]) await deleteFile(path, { nodeType: 'file' });
      }
    },
    [stat, deleteFile],
  );

  const rollback = useCallback(
    async (createdFolder: boolean, attempted: string[]) => {
      try {
        if (createdFolder) {
          await removeFolder(SKETCH_DIR);
        } else {
          await removeFiles(attempted);
        }
      } catch (error) {
        console.error('Failed to roll back the sketch files:', error);
      }
    },
    [removeFolder, removeFiles],
  );

  const addSketch = useCallback(async (): Promise<void> => {
    if (runningRef.current || !appPath) return;
    runningRef.current = true;

    try {
      let folder, ino, yaml;
      try {
        [folder, ino, yaml] = await Promise.all([
          stat(SKETCH_DIR),
          stat(MAIN_SKETCH_PATH),
          stat(SKETCH_YAML_PATH),
        ]);
      } catch (error) {
        console.error('Failed to check the sketch files:', error);
        onAddSketchError();
        return;
      }

      if (folder && !folder.isDir) {
        onAddSketchError();
        return;
      }

      const missing = [
        ...(ino ? [] : [MAIN_SKETCH_PATH]),
        ...(yaml ? [] : [SKETCH_YAML_PATH]),
      ];
      const attempted: string[] = [];
      let createdFolder = false;

      try {
        if (!folder) {
          await addFolder(SKETCH_DIR);
          createdFolder = true;
        }
        for (const path of missing) {
          attempted.push(path);
          await writeFile(path, TEMPLATES[path]);
        }
      } catch (error) {
        console.error('Failed to add a sketch:', error);
        await rollback(createdFolder, attempted);
        invalidateDirs([MAIN_SKETCH_PATH]);
        onAddSketchError();
        return;
      }

      revealPath(MAIN_SKETCH_PATH);
      void openFile(MAIN_SKETCH_PATH);
    } finally {
      runningRef.current = false;
    }
  }, [
    appPath,
    stat,
    addFolder,
    writeFile,
    rollback,
    invalidateDirs,
    onAddSketchError,
    revealPath,
    openFile,
  ]);

  const createSketchFile = useCallback(
    async (path: string): Promise<void> => {
      const companion =
        path === MAIN_SKETCH_PATH ? SKETCH_YAML_PATH : MAIN_SKETCH_PATH;

      let companionExists;
      try {
        companionExists = !!(await stat(companion));
      } catch (error) {
        throw new SketchFileCheckError(String(error));
      }

      const attempted = [path];
      try {
        await writeFile(path, TEMPLATES[path]);
        if (!companionExists) {
          attempted.push(companion);
          await writeFile(companion, TEMPLATES[companion]);
        }
      } catch (error) {
        await rollback(false, attempted);
        throw error;
      }
    },
    [stat, writeFile, rollback],
  );

  return { addSketch, createSketchFile };
}
