import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NetworkContext, NetworkContextValue } from '../network/networkContext';
import { useCloudConnector } from './cloudConnectorContextProvider.logic';

vi.mock('@tanstack/react-router', () => ({
  useNavigate: (): (() => void) => vi.fn(),
  useLocation: (): { pathname: string } => ({ pathname: '/settings' }),
}));

vi.mock('../auth/authContextProvider.logic', () => ({
  useAuth: (): { user: { id: string } } => ({ user: { id: 'user' } }),
}));

vi.mock('../../store/boardLifecycle', async () => {
  const actual = await vi.importActual<
    typeof import('../../store/boardLifecycle')
  >('../../store/boardLifecycle');
  return {
    ...actual,
    useBoardLifecycleStore: vi.fn((selector) =>
      selector({
        boardIsReachable: true,
        selectedConnectedBoard: { serial: 'abc' },
        needsImageUpdate: false,
        setBoardIsFlashing: vi.fn(),
      }),
    ),
  };
});

vi.mock(
  '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab',
  async () => {
    const actual = await vi.importActual<
      typeof import('@cloud-editor-mono/ui-components/lib/components-by-app/app-lab')
    >('@cloud-editor-mono/ui-components/lib/components-by-app/app-lab');
    return {
      ...actual,
      snackbar: vi.fn(),
      useI18n: (): { formatMessage: (m: { id: string }) => string } => ({
        formatMessage: (m) => m.id,
      }),
    };
  },
);

vi.mock(
  '@cloud-editor-mono/domain/src/services/services-by-app/app-lab',
  async () => {
    const actual = await vi.importActual<
      typeof import('@cloud-editor-mono/domain/src/services/services-by-app/app-lab')
    >('@cloud-editor-mono/domain/src/services/services-by-app/app-lab');
    return {
      ...actual,
      getCloudConnectorStatus: vi.fn(),
      startCloudConnectorProvisioning: vi.fn(),
      deleteCloudConnectorDevice: vi.fn(),
      openLinkExternal: vi.fn(),
    };
  },
);

const domainServices = vi.mocked(
  await import(
    '@cloud-editor-mono/domain/src/services/services-by-app/app-lab'
  ),
);

const uiComponents = vi.mocked(
  await import(
    '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab'
  ),
);

const createWrapper = () =>
  function CloudConnectorTestWrapper({
    children,
  }: PropsWithChildren): JSX.Element {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const network = { isConnected: true } as NetworkContextValue;
    return (
      <QueryClientProvider client={client}>
        <NetworkContext.Provider value={network}>
          {children}
        </NetworkContext.Provider>
      </QueryClientProvider>
    );
  };

beforeEach(() => {
  vi.clearAllMocks();
  domainServices.startCloudConnectorProvisioning.mockResolvedValue(
    undefined as never,
  );
});

describe('useCloudConnector - provisioning after a failed attempt', () => {
  it('keeps isConnecting while the daemon reports the new attempt as in progress', async () => {
    domainServices.getCloudConnectorStatus.mockResolvedValue({
      provisioning: 'error',
    } as never);

    const { result } = renderHook(() => useCloudConnector(), {
      wrapper: createWrapper(),
    });
    await waitFor(() =>
      expect(result.current.status?.provisioning).toBe('error'),
    );

    domainServices.getCloudConnectorStatus.mockResolvedValue({
      provisioning: 'provisioning',
    } as never);

    await act(async () => {
      await result.current.startProvisioning({ id: 'org' } as never);
    });

    // The refetch after the start request has landed.
    await waitFor(() =>
      expect(result.current.status?.provisioning).toBe('provisioning'),
    );
    expect(result.current.isConnecting).toBe(true);
  });

  it('ends isConnecting and notifies once the daemon reports provisioned', async () => {
    domainServices.getCloudConnectorStatus.mockResolvedValue({
      provisioning: 'error',
    } as never);

    const { result } = renderHook(() => useCloudConnector(), {
      wrapper: createWrapper(),
    });
    await waitFor(() =>
      expect(result.current.status?.provisioning).toBe('error'),
    );

    domainServices.getCloudConnectorStatus.mockResolvedValue({
      provisioning: 'provisioned',
    } as never);

    await act(async () => {
      await result.current.startProvisioning({ id: 'org' } as never);
    });

    await waitFor(() => expect(result.current.isConnecting).toBe(false));
    expect(result.current.status?.provisioning).toBe('provisioned');
    expect(uiComponents.snackbar).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'success' }),
    );
  });
});
