import { listAppDirectory } from '@cloud-editor-mono/domain/src/services/services-by-app/app-lab';
import { TreeNode } from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { appDirKey } from './useAppFileTree';

export const SKETCH_DIR = 'sketch';
const SKETCH_FILES = ['sketch.ino', 'sketch.yaml'];

type UseAppHasSketchParams = {
  appId: string;
  appPath?: string;
  fileTree?: TreeNode[];
  rootFailed: boolean;
  boardIsReachable: boolean;
};

// `undefined` means "cannot tell yet": a listing still loading or failed.
// Reading a failed listing as "no sketch" would tell the user something false.
export function useAppHasSketch({
  appId,
  appPath,
  fileTree,
  rootFailed,
  boardIsReachable,
}: UseAppHasSketchParams): boolean | undefined {
  const rootListsSketch = !!fileTree?.some(
    (node) => node.type === 'folder' && node.name === SKETCH_DIR,
  );

  // Same key and function as the file tree's listing of `sketch/`, so the
  // invalidations that keep the tree current (own writes, the file watcher)
  // refetch this too. This observer is what makes them refetch while the
  // folder is collapsed.
  const {
    data: sketchListing,
    isError,
    refetch,
  } = useQuery({
    queryKey: appDirKey(appId, SKETCH_DIR),
    queryFn: () => listAppDirectory(appPath as string, SKETCH_DIR),
    enabled: !!appPath && rootListsSketch,
  });

  // `retry` is off app-wide, so a listing that failed while the board was
  // away would otherwise stay failed until the next change to the folder.
  const wasReachableRef = useRef(boardIsReachable);
  useEffect(() => {
    const reconnected = boardIsReachable && !wasReachableRef.current;
    wasReachableRef.current = boardIsReachable;
    if (reconnected && isError && rootListsSketch) {
      void refetch();
    }
  }, [boardIsReachable, isError, rootListsSketch, refetch]);

  if (rootFailed || !fileTree) return undefined;
  if (!rootListsSketch) return false;
  if (isError || !sketchListing) return undefined;

  return SKETCH_FILES.every((name) =>
    sketchListing.some((node) => node.type === 'file' && node.name === name),
  );
}
