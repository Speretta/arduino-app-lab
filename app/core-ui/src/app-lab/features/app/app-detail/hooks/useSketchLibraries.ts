import { assertNonNull } from '@cloud-editor-mono/common';
import {
  addAppSketchLibrary,
  deleteAppSketchLibrary,
  getAppSketchLibraries,
  getSketchLibraries,
} from '@cloud-editor-mono/domain/src/services/services-by-app/app-lab';
import {
  LibraryListResponse,
  ListLibrariesParams,
  SketchLibrary,
} from '@cloud-editor-mono/infrastructure';
import {
  InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { BoardScopedQuery } from '../../../../boardScopedQuery';

// A board on a Wi-Fi network without internet can leave the search request
// open with no reply. The limit turns that into an error the dialog can show.
export const LIBRARY_SEARCH_TIMEOUT_MS = 30_000;

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Library search timed out after ${ms} ms`)),
      ms,
    );
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });

export interface UseSketchLibraries {
  libraries?: SketchLibrary[];
  librarySearchIsLoading: boolean;
  librarySearchError: boolean;
  retryLibrarySearch: () => void;
  searchSketchLibraries: (query: ListLibrariesParams['query']) => void;
  appLibraries?: Array<{ id: string; version: string }>;
  appLibrariesById: Record<string, string>;
  appLibrariesAreLoading: boolean;
  installingLibraryId?: string;
  addSketchLibrary: (libRef: string) => void;
  addSketchLibraryError?: boolean;
  deletingLibraryId?: string;
  deleteSketchLibrary: (libRef: string) => Promise<void>;
}

interface UseSketchLibrariesParams {
  appId?: string;
  // `undefined`: the sketch folder listing is loading or failed.
  hasSketch?: boolean;
  refetchSketchYaml?: () => Promise<unknown>;
  onAddSuccess?: () => void;
  onAddError?: () => void;
  onDeleteSuccess?: () => void;
  onDeleteError?: () => void;
}

export const useSketchLibraries = ({
  appId,
  hasSketch,
  refetchSketchYaml,
  onAddSuccess,
  onAddError,
  onDeleteSuccess,
  onDeleteError,
}: UseSketchLibrariesParams): UseSketchLibraries => {
  const queryClient = useQueryClient();

  const [searchParams, setSearchParams] = useState<
    ListLibrariesParams['query'] | null
  >(null);

  const {
    data,
    isFetching: librarySearchIsFetching,
    isError: librarySearchError,
    refetch: refetchLibrarySearch,
  } = useInfiniteQuery<
    LibraryListResponse,
    Error,
    InfiniteData<LibraryListResponse, number>,
    [string, ListLibrariesParams['query'] | null],
    number
  >({
    queryKey: [BoardScopedQuery.LIST_SKETCH_LIBRARIES, searchParams],
    queryFn: async ({ pageParam, queryKey }) => {
      const [, query] = queryKey;
      // Pass both the core search params and the current page to your API
      return withTimeout(
        getSketchLibraries({
          query: {
            ...query,
            page: pageParam,
            limit: 50,
          },
        }),
        LIBRARY_SEARCH_TIMEOUT_MS,
      );
    },
    initialPageParam: 1,
    getNextPageParam: (response) => {
      const { page = 1, total_pages = 1 } = response.pagination || {};
      return page < total_pages ? page + 1 : undefined;
    },
    enabled: searchParams !== null,
  });

  // isLoading stays false while a failed search is retried; the dialog must
  // show the skeleton then too, not the old error.
  const librarySearchIsLoading = librarySearchIsFetching && !data;

  const retryLibrarySearch = useCallback((): void => {
    void refetchLibrarySearch();
  }, [refetchLibrarySearch]);

  const searchSketchLibraries = useCallback(
    (params: ListLibrariesParams['query']): void => {
      setSearchParams(params);
    },
    [],
  );

  const libraries = useMemo(
    () =>
      data?.pages.flatMap((page) =>
        page.libraries ? page.libraries.filter(Boolean) : [],
      ),
    [data?.pages],
  );

  const { data: cachedAppLibraries, isLoading: appLibrariesAreLoading } =
    useQuery({
      queryKey: [BoardScopedQuery.APP_SKETCH_LIBRARIES, appId],

      queryFn: async () => {
        if (appId) {
          const resp = await getAppSketchLibraries(appId);
          return resp.libraries.map((libRef) => {
            const [id, version] = libRef.split('@');
            return { id, version };
          });
        }
      },
      enabled: !!appId && hasSketch === true,
    });

  // A disabled query keeps its last data. Without a sketch that list names
  // libraries the daemon can no longer remove, and a sketch added later would
  // show it until its first request returns. A listing that failed says
  // nothing about the sketch, so the last list stays.
  const appLibraries = hasSketch === false ? undefined : cachedAppLibraries;
  useEffect(() => {
    if (hasSketch === false && appId) {
      void queryClient.resetQueries({
        queryKey: [BoardScopedQuery.APP_SKETCH_LIBRARIES, appId],
        exact: true,
      });
    }
  }, [appId, hasSketch, queryClient]);

  const appLibrariesById = useMemo(
    () =>
      (appLibraries || []).reduce((obj, { id, version }) => {
        return { ...obj, [id]: version };
      }, {} as Record<string, string>),
    [appLibraries],
  );

  const {
    mutate: addSketchLibrary,
    isError: addSketchLibraryError,
    isPending: isAddingSketchLibrary,
    variables: libRef,
  } = useMutation({
    mutationFn: async (libRef: string): Promise<void> => {
      assertNonNull(appId);
      await addAppSketchLibrary(appId, libRef);
    },
    onSuccess: async () => {
      assertNonNull(appId);
      await queryClient.invalidateQueries({
        queryKey: [BoardScopedQuery.APP_SKETCH_LIBRARIES, appId],
      });
      if (refetchSketchYaml) {
        try {
          await refetchSketchYaml();
        } catch (error) {
          // Sketch.yaml doesn't exist, that's okay for sketch-only apps
        }
      }
      onAddSuccess?.();
    },
    onError: () => {
      onAddError?.();
    },
  });

  const [deletingLibraryId, setDeletingLibraryId] = useState<
    string | undefined
  >(undefined);

  const deleteSketchLibrary = useCallback(
    async (libRef: string): Promise<void> => {
      assertNonNull(appId);
      const id = libRef.split('@')[0];
      setDeletingLibraryId(id);
      try {
        await deleteAppSketchLibrary(appId, libRef);
        await queryClient.invalidateQueries({
          queryKey: [BoardScopedQuery.APP_SKETCH_LIBRARIES, appId],
        });
        if (refetchSketchYaml) {
          try {
            await refetchSketchYaml();
          } catch (error) {
            // Sketch.yaml doesn't exist, that's okay for sketch-only apps
          }
        }
        onDeleteSuccess?.();
      } catch {
        onDeleteError?.();
      } finally {
        setDeletingLibraryId(undefined);
      }
    },
    [appId, onDeleteError, onDeleteSuccess, queryClient, refetchSketchYaml],
  );

  return {
    libraries,
    librarySearchIsLoading,
    librarySearchError,
    retryLibrarySearch,
    searchSketchLibraries,
    appLibraries,
    appLibrariesById,
    appLibrariesAreLoading,
    installingLibraryId:
      isAddingSketchLibrary && libRef ? libRef.split('@')[0] : undefined,
    addSketchLibrary,
    addSketchLibraryError,
    deletingLibraryId,
    deleteSketchLibrary,
  };
};
