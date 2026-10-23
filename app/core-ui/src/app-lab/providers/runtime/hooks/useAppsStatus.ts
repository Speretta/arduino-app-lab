import {
  getApps,
  getAppStatus,
} from '@cloud-editor-mono/domain/src/services/services-by-app/app-lab';
import {
  AppDetailedInfo,
  StreamEvent,
  StreamEventType,
} from '@cloud-editor-mono/infrastructure';
import { EventSourceMessage } from '@microsoft/fetch-event-source';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { debounce } from 'lodash-es';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { BoardScopedQuery } from '../../../boardScopedQuery';
import { useAppSSE } from '../../../features/app/app-detail/hooks/useAppSSE';
import { useBoardLifecycleStore } from '../../../store/boardLifecycle';
import { getBoardCacheId } from '../../../utils/board';

type UseAppsStatus = () => {
  apps?: AppDetailedInfo[];
  defaultApp?: AppDetailedInfo;
  failedApp?: AppDetailedInfo;
  runningApp?: AppDetailedInfo;
};

const useAppsStatus: UseAppsStatus = function (): ReturnType<UseAppsStatus> {
  const { boardIsFlashing, boardIsReachable, boardCacheId } =
    useBoardLifecycleStore(
      useShallow((state) => ({
        boardIsFlashing: state.boardIsFlashing,
        boardIsReachable: state.boardIsReachable,
        boardCacheId: getBoardCacheId(state.selectedConnectedBoard),
      })),
    );

  const queryClient = useQueryClient();

  const { data: apps } = useQuery({
    queryKey: [BoardScopedQuery.LIST_MY_APPS],

    queryFn: () => {
      //This query retrieves all the apps (examples/myapps) and sync the status of the apps with the server.
      return getApps({ query: {} });
    },
    enabled: boardIsReachable,
  });

  const defaultApp = useMemo(() => {
    return apps?.find((app) => app.default) as AppDetailedInfo;
  }, [apps]);

  const runningApp = useMemo(() => {
    return apps?.find((app) => app.status === 'running') as AppDetailedInfo;
  }, [apps]);

  const failedApp = useMemo(() => {
    return apps?.find((app) => app.status === 'failed') as AppDetailedInfo;
  }, [apps]);

  //Debounce the invalidate of the query to avoid multiple invalidations in a short period of time when multiple events are received from the SSE
  const debouncedInvalidate = useMemo(
    () =>
      debounce(() => {
        queryClient.invalidateQueries({
          queryKey: [BoardScopedQuery.LIST_MY_APPS],
        });
      }, 300),
    [queryClient],
  );

  const handleOnStatusMessage = useCallback(
    (message: EventSourceMessage): void => {
      let normalizedEvent: StreamEvent;
      try {
        const parsedData = JSON.parse(message.data);
        normalizedEvent = {
          event: message.event as StreamEventType,
          data: parsedData,
        };
      } catch (parseError) {
        console.warn(parseError);
        return;
      }

      //Save the normalizeEvent app
      if (normalizedEvent.event === StreamEventType.App) {
        debouncedInvalidate();
      }
    },
    [debouncedInvalidate],
  );

  const {
    isConnected,
    isConnecting,
    connect: connectToAppStatusSSE,
    abort: getAppStatusAbort,
  } = useAppSSE({
    appSSE: getAppStatus,
    handlers: {
      onmessage: handleOnStatusMessage,
    },
  });

  // The board the open stream belongs to. A switch keeps the board reachable
  // and the old stream connected, so connection state alone never reconnects.
  const streamBoardCacheId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (boardIsFlashing) {
      if (isConnected || isConnecting) {
        getAppStatusAbort();
      }
      return;
    }

    if (!boardIsReachable) {
      return;
    }

    const previousBoardCacheId = streamBoardCacheId.current;
    if (boardCacheId) {
      streamBoardCacheId.current = boardCacheId;
    }
    const boardSwitched =
      !!previousBoardCacheId &&
      !!boardCacheId &&
      previousBoardCacheId !== boardCacheId;

    if (boardSwitched || (!isConnected && !isConnecting)) {
      // connect() aborts the previous stream before opening the new one.
      connectToAppStatusSSE();
    }
  }, [
    boardCacheId,
    boardIsFlashing,
    boardIsReachable,
    connectToAppStatusSSE,
    getAppStatusAbort,
    isConnected,
    isConnecting,
  ]);

  useEffect(() => {
    return () => {
      getAppStatusAbort();
    };
  }, [getAppStatusAbort]);

  // Refreshing app queries on board switch is handled centrally by
  // useBoardScopedQueryReset (keyed on the reliable board cache id rather than
  // the raw serial, which is empty/unstable for network boards).

  const filteredApps = useMemo(() => {
    return apps?.filter((app) => app.id) as AppDetailedInfo[];
  }, [apps]);

  return { apps: filteredApps, defaultApp, failedApp, runningApp };
};

export default useAppsStatus;
