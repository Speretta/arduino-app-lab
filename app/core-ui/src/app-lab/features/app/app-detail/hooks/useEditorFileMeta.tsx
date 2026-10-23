import { FileIcon } from '@cloud-editor-mono/images/assets/file-icons';
import { AppBrickListItem } from '@cloud-editor-mono/infrastructure';
import {
  BRICK_FILE_EXTENSION,
  BrickIcon,
  SelectableFileData,
} from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { useMemo, useRef } from 'react';

type MetaCacheEntry = { key: string; meta: SelectableFileData };

/**
 * Tab meta for a file path. Everything comes from the path, so a file the
 * editor has never opened resolves the same as one already in a tab.
 */
export const metaFromPath = (
  path: string,
  isExternal: boolean,
): SelectableFileData => {
  const fullName = path.split('/').pop() ?? path;
  const baseName = fullName.includes('.')
    ? fullName.split('.').slice(0, -1).join('.')
    : fullName;
  const ext = fullName.includes('.') ? fullName.split('.').pop() ?? '' : '';

  return {
    fileId: path,
    fileFullName: fullName,
    fileName: baseName,
    fileExtension: ext,
    Icon: <FileIcon fileName={fullName} />,
    tags: [],
    ...(isExternal ? { isMetadataReadOnly: true } : {}),
  };
};

// Builds the tab-meta catalogue (open files + bricks) and caches each
// SelectableFileData per fileId so unchanged ids return the SAME reference
// across rebuilds. Identity stability matters because the editor panel memo and
// a few effects depend on the selected file's object identity — without the
// cache, an unrelated file's content edit would re-create every tab-meta object.
//
// Everything here comes from the path, so no listing of the app is involved.
// External files (a leading `/` for onboard, `file://` for host-machine) differ
// only in being marked read-only.
export function useEditorFileMeta(
  filePaths: string[] | undefined,
  appBricks: AppBrickListItem[] | undefined,
  externalPaths: string[] | undefined,
): Map<string, SelectableFileData> {
  const cacheRef = useRef<Map<string, MetaCacheEntry>>(new Map());

  return useMemo(() => {
    const next = new Map<string, SelectableFileData>();

    const addPath = (path: string, isExternal: boolean): void => {
      const key = `${isExternal ? 'external' : 'file'}|${path}`;
      const prev = cacheRef.current.get(path);
      if (prev && prev.key === key) {
        next.set(path, prev.meta);
        return;
      }
      const meta = metaFromPath(path, isExternal);
      next.set(path, meta);
      cacheRef.current.set(path, { key, meta });
    };

    for (const path of filePaths ?? []) addPath(path, false);

    for (const brick of appBricks ?? []) {
      const id = brick.id ?? '';
      const name = brick.name ?? '';
      const category = brick.category ?? '';
      const key = `brick|${id}|${name}|${category}`;
      const prev = cacheRef.current.get(id);
      if (prev && prev.key === key) {
        next.set(id, prev.meta);
      } else {
        const meta: SelectableFileData = {
          fileId: id,
          fileName: name,
          fileFullName: name,
          fileExtension: BRICK_FILE_EXTENSION,
          Icon: <BrickIcon category={category} size="xsmall" />,
          tags: [],
        };
        next.set(id, meta);
        cacheRef.current.set(id, { key, meta });
      }
    }

    for (const path of externalPaths ?? []) addPath(path, true);

    // Drop entries for ids that are no longer present in any input,
    // so the cache size tracks the live set instead of growing
    // monotonically as files/bricks/external paths come and go.
    for (const id of cacheRef.current.keys()) {
      if (!next.has(id)) cacheRef.current.delete(id);
    }

    return next;
  }, [filePaths, appBricks, externalPaths]);
}
