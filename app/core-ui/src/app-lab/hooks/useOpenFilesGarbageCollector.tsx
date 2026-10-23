import { getApps } from '@cloud-editor-mono/domain/src/services/services-by-app/app-lab';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { BoardScopedQuery } from '../boardScopedQuery';
import { MY_APPS_FILTER } from '../features/release/releaseApp';
import { pruneOrphanedOpenFiles } from '../services/openFilesStore';
import { useBoardLifecycleStore } from '../store/boardLifecycle';

// Runs from an always-mounted provider so a deep link straight into an app
// detail (which never mounts the app list) still reconciles persisted state.
export const useOpenFilesGarbageCollector = (): void => {
  const boardIsReachable = useBoardLifecycleStore(
    (state) => state.boardIsReachable,
  );
  const boardSerial = useBoardLifecycleStore(
    (state) => state.selectedConnectedBoard?.serial,
  );

  const { data: apps, isSuccess } = useQuery({
    queryKey: [BoardScopedQuery.LIST_MY_APPS, 'my-apps'],
    queryFn: () => getApps({ query: { filter: MY_APPS_FILTER } }),
    enabled: boardIsReachable,
  });

  useEffect(() => {
    // Re-prune on every successful, non-empty list so an app deleted mid-session
    // — including externally, where the apps watcher invalidates this shared
    // query — has its record dropped before a same-named app can inherit it.
    // A failed or empty response must never read as "every app is gone".
    if (!boardSerial || !isSuccess || !apps?.length) return;

    const ids = apps
      .map((app) => app.id)
      .filter((id): id is string => Boolean(id));
    void pruneOrphanedOpenFiles(ids, boardSerial);
  }, [apps, isSuccess, boardSerial]);
};

export const OpenFilesGarbageCollector: React.FC = () => {
  useOpenFilesGarbageCollector();
  return null;
};
