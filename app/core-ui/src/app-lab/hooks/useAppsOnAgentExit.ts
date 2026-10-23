import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { BoardScopedQuery } from '../boardScopedQuery';

// Agent mode unmounts the editor's routes, and the agent can rename, delete or create apps behind them. Returning is
// a history.back() onto the old URL, which react-query answers from cache, so the editor would otherwise show the
// board as it was before the conversation. Refresh the app queries on the way out; the key is a prefix, so this
// covers the app list and every per-app detail.
//
// APP_DIR goes too: the agent's whole job is writing app files, so every directory listing the editor still holds
// may be stale.
//
// It deliberately does NOT decide that an app is gone. Absence from the list is not evidence of deletion: an app
// whose app.yaml stops parsing is dropped from /v1/apps into its broken_apps bucket, which getApps discards. Acting
// on that inference ejected the user from an app they were still editing, and the app list cannot reopen a broken
// app — so they would have had no way back in to fix the file.
export const useAppsOnAgentExit = (agentModeActive: boolean): void => {
  const queryClient = useQueryClient();
  const wasActive = useRef(agentModeActive);

  useEffect(() => {
    // Only the exit: on entry, and on the first render, there is nothing to refresh.
    if (wasActive.current && !agentModeActive) {
      queryClient.invalidateQueries({
        queryKey: [BoardScopedQuery.LIST_MY_APPS],
      });
      queryClient.invalidateQueries({
        queryKey: [BoardScopedQuery.APP_DIR],
      });
      // Derived from the root listing, so it goes stale with it.
      queryClient.invalidateQueries({
        queryKey: [BoardScopedQuery.APP_DEFAULT_FILE],
      });
    }
    wasActive.current = agentModeActive;
  }, [agentModeActive, queryClient]);
};
