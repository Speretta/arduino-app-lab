import { AIModelItem } from '@cloud-editor-mono/infrastructure';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BoardScopedQuery } from '../boardScopedQuery';
import { useBoardLifecycleStore } from '../store/boardLifecycle';
import { useInstalledAIModels } from './useInstalledAIModels';

vi.mock(
  '@cloud-editor-mono/domain/src/services/services-by-app/app-lab',
  async () => {
    const actual = await vi.importActual<
      typeof import('@cloud-editor-mono/domain/src/services/services-by-app/app-lab')
    >('@cloud-editor-mono/domain/src/services/services-by-app/app-lab');

    return {
      ...actual,
      getAIModels: vi.fn(),
    };
  },
);

const domainServices = vi.mocked(
  await import(
    '@cloud-editor-mono/domain/src/services/services-by-app/app-lab'
  ),
);

const makeModel = (id: string): AIModelItem => ({
  id,
  id_decoded: id,
  name: id,
  description: '',
  runner: '',
  brick_ids: [],
  is_builtin: false,
  origin: 'user',
  status: 'installed',
});

const DECLARED = makeModel('llamacpp:Qwen3.5-2B-Q4_K_M');
// An Edge Impulse model installed from an account-linked project is keyed by
// the project and the impulse it was deployed from.
const EI_MODEL = makeModel('ei-model-731234-9');

// The same model as a daemon that addresses models by a base64url id reports
// it: `id` encoded, the plain spelling beside it. The project/impulse key a
// caller builds itself can only ever match that plain spelling.
const ENCODED_EI_MODEL: AIModelItem = {
  ...EI_MODEL,
  id: 'ZWktbW9kZWwtNzMxMjM0LTk',
  id_decoded: 'ei-model-731234-9',
};

let queryClient: QueryClient;

const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

const setBoardReachable = (isReachable: boolean): void => {
  act(() => {
    useBoardLifecycleStore.setState({ boardIsReachable: isReachable });
  });
};

describe('useInstalledAIModels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    domainServices.getAIModels.mockResolvedValue([DECLARED, EI_MODEL]);
    setBoardReachable(true);
  });

  it('looks a model up by its plain id, and an impulse by project and impulse', async () => {
    const { result } = renderHook(() => useInstalledAIModels(), { wrapper });

    await waitFor(() => {
      expect(result.current.installedModels).toHaveLength(2);
    });

    expect(result.current.getInstalledModel(DECLARED.id)).toEqual(DECLARED);
    expect(result.current.getInstalledModel('731234', '9')).toEqual(EI_MODEL);
    expect(result.current.getInstalledModel('731234')).toBeUndefined();
    expect(
      result.current.getInstalledModel('nothing-installed'),
    ).toBeUndefined();
  });

  it('finds a model whose id the daemon reports encoded, by either spelling', async () => {
    domainServices.getAIModels.mockResolvedValue([ENCODED_EI_MODEL]);

    const { result } = renderHook(() => useInstalledAIModels(), { wrapper });

    await waitFor(() => {
      expect(result.current.installedModels).toHaveLength(1);
    });

    expect(result.current.getInstalledModel(ENCODED_EI_MODEL.id)).toEqual(
      ENCODED_EI_MODEL,
    );
    expect(result.current.getInstalledModel('731234', '9')).toEqual(
      ENCODED_EI_MODEL,
    );
  });

  // The whole point of reading the models through this hook is that a consumer
  // which only needs the lookup in a callback does not re-subscribe on every
  // render: `runApp` holds it in a `useCallback` dependency list.
  it('keeps the getter identity while the installed models do not change', async () => {
    const { result, rerender } = renderHook(() => useInstalledAIModels(), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.installedModels).toHaveLength(2);
    });

    const getter = result.current.getInstalledModel;

    rerender();
    expect(result.current.getInstalledModel).toBe(getter);

    act(() => {
      queryClient.setQueryData(
        [BoardScopedQuery.GET_INSTALLED_MODELS],
        [DECLARED],
      );
    });

    await waitFor(() => {
      expect(result.current.getInstalledModel).not.toBe(getter);
    });
    expect(result.current.getInstalledModel(EI_MODEL.id)).toBeUndefined();
  });

  it('does not ask an unreachable board for its models', async () => {
    setBoardReachable(false);

    const { result } = renderHook(() => useInstalledAIModels(), { wrapper });

    expect(domainServices.getAIModels).not.toHaveBeenCalled();
    expect(result.current.installedModels).toBeUndefined();

    setBoardReachable(true);

    await waitFor(() => {
      expect(domainServices.getAIModels).toHaveBeenCalledTimes(1);
    });
  });

  // The provider reads the models through this hook too, so a screen holding
  // both must not double the request: they share one query key.
  it('shares one request between callers', async () => {
    const { result } = renderHook(
      () => ({ first: useInstalledAIModels(), second: useInstalledAIModels() }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.first.installedModels).toHaveLength(2);
    });

    expect(result.current.second.installedModels).toEqual(
      result.current.first.installedModels,
    );
    expect(domainServices.getAIModels).toHaveBeenCalledTimes(1);
  });
});
