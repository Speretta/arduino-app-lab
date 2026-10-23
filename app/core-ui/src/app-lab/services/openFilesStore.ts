import {
  mergeStoreItem,
  OPEN_FILES_KEY,
  OpenFilesStore,
  OpenFilesStoreItem,
  OpenFilesStorePatch,
} from '../../common/hooks/files';
import * as IDB from './persistentStore';

const EXAMPLE_SUFFIX = '-example';

const entryKeyForApp = (appId: string, serial?: string): string =>
  serial ? `${appId}-${serial}` : appId;

// Serialize writes so an editor patch and a GC prune can't interleave their
// read-modify-write and clobber one another.
let writeQueue: Promise<unknown> = Promise.resolve();
const enqueueWrite = <T>(task: () => Promise<T>): Promise<T> => {
  const result = writeQueue.then(task, task);
  writeQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
};

const mutateStore = (
  mutator: (store: OpenFilesStore) => OpenFilesStore,
): Promise<void> =>
  enqueueWrite(() =>
    IDB.update<OpenFilesStore>(OPEN_FILES_KEY, (prev) => mutator(prev ?? {})),
  );

export const getOpenFilesEntry = async (
  key: string,
): Promise<OpenFilesStoreItem | undefined> => {
  const store = await IDB.get<OpenFilesStore>(OPEN_FILES_KEY);
  return store?.[key];
};

export const patchOpenFilesEntry = (
  key: string,
  buildPatch: (prev: OpenFilesStoreItem | undefined) => OpenFilesStorePatch,
  transform: (item: OpenFilesStoreItem) => OpenFilesStoreItem = (
    item,
  ): OpenFilesStoreItem => item,
): Promise<void> =>
  mutateStore((store) => {
    const prevItem = store[key];
    return {
      ...store,
      [key]: transform(mergeStoreItem(prevItem, buildPatch(prevItem))),
    };
  });

export const moveOpenFilesEntry = (
  fromKey: string,
  toKey: string,
): Promise<void> =>
  mutateStore((store) => {
    if (fromKey === toKey || !(fromKey in store)) return store;
    const { [fromKey]: item, ...rest } = store;
    return item ? { ...rest, [toKey]: item } : rest;
  });

export const removeOpenFilesForApp = (
  appId: string,
  serial?: string,
): Promise<void> =>
  mutateStore((store) => {
    const key = entryKeyForApp(appId, serial);
    if (!(key in store)) return store;
    const { [key]: _removed, ...rest } = store;
    return rest;
  });

export const pruneOrphanedOpenFiles = (
  existingAppIds: string[],
  serial?: string,
): Promise<void> => {
  if (!serial || existingAppIds.length === 0) return Promise.resolve();

  const boardSuffix = `-${serial}`;
  const existing = new Set(existingAppIds);

  return mutateStore((store) => {
    let changed = false;
    const next: OpenFilesStore = {};
    for (const key of Object.keys(store)) {
      const isCurrentBoardKey =
        key.endsWith(boardSuffix) && !key.endsWith(EXAMPLE_SUFFIX);
      const appId = isCurrentBoardKey
        ? key.slice(0, -boardSuffix.length)
        : undefined;

      if (appId !== undefined && !existing.has(appId)) {
        changed = true;
        continue;
      }
      next[key] = store[key];
    }
    return changed ? next : store;
  });
};
