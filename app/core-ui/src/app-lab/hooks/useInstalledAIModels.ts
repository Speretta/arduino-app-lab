import { getAIModels } from '@cloud-editor-mono/domain/src/services/services-by-app/app-lab';
import { AIModelItem } from '@cloud-editor-mono/infrastructure';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { BoardScopedQuery } from '../boardScopedQuery';
import { useBoardLifecycleStore } from '../store/boardLifecycle';
import { plainModelId } from '../utils/modelId';

type UseInstalledAIModels = () => {
  installedModels: AIModelItem[] | undefined;
  getInstalledModel: (
    modelId: string,
    impulseId?: string,
  ) => AIModelItem | undefined;
};

// Read installed models here rather than through `useAiModels`: the query is
// shared by key, so a consumer does not subscribe to download progress.
export const useInstalledAIModels: UseInstalledAIModels = () => {
  const boardIsReachable = useBoardLifecycleStore(
    (state) => state.boardIsReachable,
  );

  // useBoardScopedQueryReset drops this cache on a board switch, so the key
  // itself stays board-agnostic.
  const { data: installedModels } = useQuery({
    queryKey: [BoardScopedQuery.GET_INSTALLED_MODELS],
    queryFn: getAIModels,
    enabled: !!boardIsReachable,
  });

  // Keyed by both spellings: the Edge Impulse callers look up an
  // `ei-model-<project>-<impulse>` key that no response ever handed them.
  const installedModelsLookup = useMemo(() => {
    const lookup: { [key: string]: AIModelItem } = {};
    for (const model of installedModels || []) {
      lookup[model.id] = model;
      lookup[plainModelId(model)] = model;
    }
    return lookup;
  }, [installedModels]);

  const getInstalledModel = useCallback(
    (modelId: string, impulseId?: string) => {
      const id = impulseId ? `ei-model-${modelId}-${impulseId}` : modelId;
      return installedModelsLookup?.[id];
    },
    [installedModelsLookup],
  );

  return { installedModels, getInstalledModel };
};
