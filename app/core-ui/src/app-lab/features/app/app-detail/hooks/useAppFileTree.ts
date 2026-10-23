import {
  listAppDirectory,
  statAppPath,
} from '@cloud-editor-mono/domain/src/services/services-by-app/app-lab';
import {
  FileNode,
  TreeNode,
} from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import {
  QueryKey,
  useQueries,
  useQueryClient,
  UseQueryResult,
} from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { BoardScopedQuery } from '../../../../boardScopedQuery';
import { isAbsoluteId, parentDir } from './filePaths';

const ROOT_DIR = '';
const ROOT_ONLY: string[] = [ROOT_DIR];

export const appDirKey = (appId: string, relDir: string): QueryKey => [
  BoardScopedQuery.APP_DIR,
  appId,
  relDir,
];

type UseAppFileTreeParams = {
  appId: string;
  appPath?: string;
  // A directory whose listing failed is dropped rather than left on screen as
  // an empty folder; the caller decides how to report it. A directory that no
  // longer exists is dropped without a call.
  onListError?: (relDir: string, error: unknown) => void;
};

// The directory whose listing failed last. `seq` distinguishes one failure
// from the next, so the same directory failing twice is still a new value.
export type ListFailure = { path: string; seq: number };

type UseAppFileTreeReturn = {
  fileTree?: TreeNode[];
  rootFailed: boolean;
  listFailure?: ListFailure;
  findFileNode: (path: string) => FileNode | undefined;
  expandDir: (dir: string) => void;
  collapseDir: (dir: string) => void;
  revealPath: (path: string) => void;
  unlistDir: (dir: string) => void;
  relistDir: (dir: string) => void;
  renameDir: (from: string, to: string) => void;
  invalidateDirs: (paths?: string[]) => void;
};

// 'python/lib/sensors.py' -> ['python', 'python/lib']
function ancestorDirs(path: string): string[] {
  const dir = parentDir(path);
  if (!dir) return [];

  const segments = dir.split('/');
  return segments.map((_, index) => segments.slice(0, index + 1).join('/'));
}

const isUnder = (dir: string, ancestor: string): boolean =>
  dir.startsWith(`${ancestor}/`);

const isAtOrUnder = (dir: string, ancestor: string): boolean =>
  dir === ancestor || isUnder(dir, ancestor);

function buildTree(
  nodes: TreeNode[],
  listings: Map<string, TreeNode[]>,
): TreeNode[] {
  return nodes.map((node) => {
    if (node.type !== 'folder') return node;

    const children = listings.get(node.path);
    return {
      ...node,
      children: children ? buildTree(children, listings) : null,
    };
  });
}

type CombinedDirResults = {
  listings: Array<TreeNode[] | undefined>;
  errors: unknown[];
};

// Defined outside the hook: React Query re-runs `combine` when the function
// identity changes, and only keeps the combined value stable across renders
// when it does not.
function combineDirResults(
  results: UseQueryResult<TreeNode[]>[],
): CombinedDirResults {
  return {
    listings: results.map((result) => result.data),
    errors: results.map((result) => result.error),
  };
}

// A map built during render is a new map every render, so deriving the tree
// from it would hand FileTree a new `nodes` array each time and remount rows
// mid-drag. The map is held in state rather than a ref: a ref written during
// render keeps whatever a render React then threw away put there.
function useStableListings(
  dirs: string[],
  data: Array<TreeNode[] | undefined>,
): Map<string, TreeNode[]> {
  const [listings, setListings] = useState<Map<string, TreeNode[]>>(
    () => new Map(),
  );

  const next = new Map<string, TreeNode[]>();
  dirs.forEach((dir, index) => {
    const listing = data[index];
    if (listing) next.set(dir, listing);
  });

  const changed =
    next.size !== listings.size ||
    Array.from(next).some(([dir, listing]) => listings.get(dir) !== listing);

  if (changed) setListings(next);
  return changed ? next : listings;
}

// The app's file tree, one directory per query, so a folder is listed when it
// is expanded and a change to it invalidates only that folder.
export function useAppFileTree({
  appId,
  appPath,
  onListError,
}: UseAppFileTreeParams): UseAppFileTreeReturn {
  const queryClient = useQueryClient();

  const [expandedDirs, setExpandedDirs] = useState<string[]>(ROOT_ONLY);
  const [listFailure, setListFailure] = useState<ListFailure>();

  // Latest expandedDirs, read by `relistDir`: it has to know whether a path is
  // listed before it acts, and a state updater would answer only once React
  // gets round to the next render.
  const expandedDirsRef = useRef(expandedDirs);
  useEffect(() => {
    expandedDirsRef.current = expandedDirs;
  }, [expandedDirs]);

  // Latest onListError, read by the query callbacks so a new handler identity
  // doesn't rebuild every query.
  const onListErrorRef = useRef(onListError);
  useEffect(() => {
    onListErrorRef.current = onListError;
  }, [onListError]);

  // Directories whose cached listing is to be dropped, so the next expand asks
  // the backend instead of serving what the path held before. Removal waits for
  // the commit that also drops them from `expandedDirs`: removing a query that
  // still has an observer just makes React Query build it again and refetch —
  // which is precisely why `relistDir` leaves the directory it drops expanded.
  const [forgotten, setForgotten] = useState<string[]>([]);

  const forgetListings = useCallback((dir: string) => {
    setForgotten((previous) => [...previous, dir]);
  }, []);

  useEffect(() => {
    if (!forgotten.length) return;
    queryClient.removeQueries({
      predicate: ({ queryKey }) =>
        queryKey[0] === BoardScopedQuery.APP_DIR &&
        queryKey[1] === appId &&
        typeof queryKey[2] === 'string' &&
        forgotten.some((dir) => isAtOrUnder(queryKey[2] as string, dir)),
    });
    setForgotten([]);
  }, [appId, forgotten, queryClient]);

  // A closed folder stops being listed — and so stops being refetched on every
  // change. Its cached listing stays, so reopening it renders immediately.
  const collapseDir = useCallback((dir: string) => {
    setExpandedDirs((previous) => {
      const next = previous.filter((d) => !isAtOrUnder(d, dir));
      return next.length === previous.length ? previous : next;
    });
  }, []);

  // A folder that comes back under the same name should come back unlisted,
  // rather than showing whatever it held before it went away. The root is
  // exempt: it is the tree, and nothing would ever list it again.
  const unlistDir = useCallback(
    (dir: string) => {
      if (dir === ROOT_DIR) return;
      collapseDir(dir);
      forgetListings(dir);
    },
    [collapseDir, forgetListings],
  );

  // A directory replaced in one step (`mv sub sub_moved && mkdir sub`) reaches
  // us as a lone create: the backend watcher debounces per path, so the remove
  // never arrives on its own. What is cached for a directory still on screen
  // therefore describes the one that left. Drop it and the descendants' with
  // it, but keep the directory itself expanded so its own query is rebuilt and
  // refetched instead of waiting for the user to reopen the folder.
  const relistDir = useCallback(
    (dir: string) => {
      // Never the root: it holds the whole expansion state, and the events that
      // land here name a child path anyway.
      if (dir === ROOT_DIR || !expandedDirsRef.current.includes(dir)) return;
      setExpandedDirs((previous) => previous.filter((d) => !isUnder(d, dir)));
      forgetListings(dir);
    },
    [forgetListings],
  );

  const handleListError = useCallback(
    (relDir: string, error: unknown) => {
      // The root reports itself through `rootFailed`.
      if (relDir === ROOT_DIR) return;
      unlistDir(relDir);
      setListFailure((previous) => ({
        path: relDir,
        seq: (previous?.seq ?? 0) + 1,
      }));
      // A listed folder moved or deleted outside the file tree (a custom brick
      // rename, an agent edit, `mv` in a terminal) fails its next refetch
      // before the watcher's remove event unlists it. That folder is gone, so
      // there is nothing to report. A stat that fails cannot tell, so it
      // reports.
      void statAppPath(`${appPath}/${relDir}`)
        .then(
          (node) => node !== null,
          () => true,
        )
        .then((stillExists) => {
          if (stillExists) onListErrorRef.current?.(relDir, error);
        });
    },
    [appPath, unlistDir],
  );

  const { listings: dirListings, errors: listErrors } = useQueries({
    queries: expandedDirs.map((relDir) => ({
      queryKey: appDirKey(appId, relDir),
      queryFn: () => listAppDirectory(appPath as string, relDir),
      enabled: !!appPath,
    })),
    combine: combineDirResults,
  });

  useEffect(() => {
    listErrors.forEach((error, index) => {
      if (error) {
        handleListError(expandedDirs[index], error);
      }
    });
  }, [listErrors, expandedDirs, handleListError]);

  const listings = useStableListings(expandedDirs, dirListings);

  const fileTree = useMemo(() => {
    const root = listings.get(ROOT_DIR);
    return root ? buildTree(root, listings) : undefined;
  }, [listings]);

  const listDirs = useCallback((relDirs: string[]) => {
    setExpandedDirs((previous) => {
      const missing = relDirs.filter((relDir) => !previous.includes(relDir));
      return missing.length ? [...previous, ...missing] : previous;
    });
  }, []);

  const expandDir = useCallback(
    (relDir: string) => listDirs([relDir]),
    [listDirs],
  );

  // Expand all ancestor directories of a path, so the tree can reveal it
  const revealPath = useCallback(
    (path: string) => {
      if (!isAbsoluteId(path)) listDirs(ancestorDirs(path));
    },
    [listDirs],
  );

  const findFileNode = useCallback(
    (path: string): FileNode | undefined => {
      const node = listings
        .get(parentDir(path))
        ?.find((entry) => entry.path === path);
      return node?.type === 'file' ? node : undefined;
    },
    [listings],
  );

  // A directory is listed as a whole, so only the ones holding these paths can
  // have gone stale. Without paths — a brick's files, an imported folder — the
  // whole app goes; only the directories still listed refetch, the rest are
  // just marked stale for whenever they are opened again.
  const invalidateDirs = useCallback(
    (paths?: string[]) => {
      if (!paths) {
        queryClient.invalidateQueries({
          queryKey: [BoardScopedQuery.APP_DIR, appId],
        });
        return;
      }
      new Set(paths.map(parentDir)).forEach((dir) => {
        queryClient.invalidateQueries({
          queryKey: appDirKey(appId, dir),
          exact: true,
        });
      });
    },
    [appId, queryClient],
  );

  // A listing is keyed by its directory's path, so a renamed folder must carry
  // its expansion (and its open subfolders) over to the new path and forget the
  // old one — anything reappearing under the old name would otherwise be shown
  // holding what the renamed folder held.
  const renameDir = useCallback(
    (from: string, to: string) => {
      setExpandedDirs((previous) =>
        previous.map((dir) =>
          isAtOrUnder(dir, from) ? `${to}${dir.slice(from.length)}` : dir,
        ),
      );
      forgetListings(from);
    },
    [forgetListings],
  );

  return {
    fileTree,
    rootFailed: !!listErrors[expandedDirs.indexOf(ROOT_DIR)],
    listFailure,
    findFileNode,
    expandDir,
    collapseDir,
    revealPath,
    unlistDir,
    relistDir,
    renameDir,
    invalidateDirs,
  };
}
