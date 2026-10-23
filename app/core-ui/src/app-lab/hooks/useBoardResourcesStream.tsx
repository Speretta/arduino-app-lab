import { BOARD_FQBN } from '@cloud-editor-mono/common';
import { getSystemResources } from '@cloud-editor-mono/domain/src/services/services-by-app/app-lab';
import { useCallback, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useBoardLifecycleStore } from '../store/boardLifecycle';
import { useBoardResourcesStore } from '../store/boardResources';
import { getBoardCacheId } from '../utils/board';

const RECONNECT_DELAY_MS = 3000;

export const useBoardResourcesStream = (): void => {
  const streamAbortController = useRef<AbortController>();
  const streamIsConnecting = useRef(false);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout>>();

  const applyMessage = useBoardResourcesStore((state) => state.applyMessage);
  const reset = useBoardResourcesStore((state) => state.reset);

  const { boardIsFlashing, boardIsReachable, boardCacheId, isVentunoQ } =
    useBoardLifecycleStore(
      useShallow((state) => ({
        boardIsFlashing: state.boardIsFlashing,
        boardIsReachable: state.boardIsReachable,
        boardCacheId: getBoardCacheId(state.selectedConnectedBoard),
        isVentunoQ: state.selectedConnectedBoard?.fqbn === BOARD_FQBN.VENTUNO_Q,
      })),
    );

  const openStream = useCallback(() => {
    if (streamIsConnecting.current) {
      return;
    }
    streamIsConnecting.current = true;

    streamAbortController.current?.abort();
    const controller = new AbortController();
    streamAbortController.current = controller;

    return getSystemResources(
      {
        onopen: async () => {
          streamIsConnecting.current = false;
        },
        onclose: () => {
          streamIsConnecting.current = false;
          if (!controller?.signal.aborted) {
            streamAbortController.current?.abort();
            reconnectTimeout.current = setTimeout(
              openStream,
              RECONNECT_DELAY_MS,
            );
          }
        },
        onerror: undefined,
        onmessage: (event) => {
          applyMessage(event.event, JSON.parse(event.data), isVentunoQ);
        },
      },
      streamAbortController.current,
    );
  }, [applyMessage, isVentunoQ]);

  useEffect(() => {
    if (boardIsFlashing || !boardIsReachable) {
      streamAbortController.current?.abort();
      return;
    }

    openStream();

    return () => {
      // A pending reconnect would reopen the stream after unmount, through a
      // closure holding the previous board's `isVentunoQ`.
      clearTimeout(reconnectTimeout.current);
      streamAbortController.current?.abort();
      streamIsConnecting.current = false;
    };
  }, [openStream, boardIsFlashing, boardIsReachable, boardCacheId]);

  useEffect(() => {
    if (boardCacheId) {
      reset();
    }
  }, [reset, boardCacheId]);
};

export const BoardResourcesStream: React.FC = () => {
  useBoardResourcesStream();
  return null;
};
