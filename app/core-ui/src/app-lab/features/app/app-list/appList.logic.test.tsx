import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { PropsWithChildren } from 'react';
import { IntlProvider } from 'react-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { queryClient as appQueryClient } from '../../../../common/providers/data-fetching/QueryProvider';
import { BoardScopedQuery } from '../../../boardScopedQuery';
import { sendAppLabNotification } from '../../notifications';
import { useAppListLogic } from './appList.logic';

let boardIsReachableMock = false;

vi.mock('@tanstack/react-router', () => ({
  useNavigate: (): (() => void) => vi.fn(),
}));

vi.mock('../../../store/boardLifecycle', async () => {
  const actual = await vi.importActual<
    typeof import('../../../store/boardLifecycle')
  >('../../../store/boardLifecycle');

  return {
    ...actual,
    useBoardLifecycleStore: vi.fn((selector) =>
      selector({
        boardIsReachable: boardIsReachableMock,
        selectedConnectedBoard: undefined,
      }),
    ),
  };
});

vi.mock(
  '@cloud-editor-mono/domain/src/services/services-by-app/app-lab',
  async () => {
    const actual = await vi.importActual<
      typeof import('@cloud-editor-mono/domain/src/services/services-by-app/app-lab')
    >('@cloud-editor-mono/domain/src/services/services-by-app/app-lab');

    return {
      ...actual,
      getApps: vi.fn(),
      getConfig: vi.fn(),
      updateAppDetail: vi.fn(),
      watchAppsDir: vi.fn(),
      unwatchAppsDir: vi.fn(),
      onWatcherRefresh: vi.fn((): (() => void) => () => undefined),
    };
  },
);

vi.mock('../../notifications', () => ({ sendAppLabNotification: vi.fn() }));

const domainServices = vi.mocked(
  await import(
    '@cloud-editor-mono/domain/src/services/services-by-app/app-lab'
  ),
);

const createWrapper = () =>
  function AppListTestWrapper({ children }: PropsWithChildren): JSX.Element {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };

beforeEach(() => {
  vi.clearAllMocks();
  domainServices.getApps.mockResolvedValue([]);
  domainServices.getConfig.mockResolvedValue({ directories: {} });
});

afterEach(() => {
  appQueryClient.clear();
});

describe('useAppListLogic - isLoading', () => {
  it('stops reporting loading once the list has arrived', async () => {
    boardIsReachableMock = true;
    domainServices.getApps.mockResolvedValue([{ id: 'app-1', name: 'One' }]);

    const { result } = renderHook(() => useAppListLogic('my-apps'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.apps).toHaveLength(1);
  });
});

describe('useAppListLogic - set as default', () => {
  it('refreshes the unfiltered app list the detail toggle reads', async () => {
    boardIsReachableMock = true;
    domainServices.getApps.mockResolvedValue([{ id: 'app-1', name: 'One' }]);
    domainServices.updateAppDetail.mockResolvedValue('app-1');
    const statusListFn = vi.fn().mockResolvedValue([]);

    // The logic invalidates through the app-wide client, so the queries must live in it.
    const { result } = renderHook(
      () => {
        useQuery({
          queryKey: [BoardScopedQuery.LIST_MY_APPS],
          queryFn: statusListFn,
        });
        return useAppListLogic('my-apps');
      },
      {
        wrapper: ({ children }: PropsWithChildren): JSX.Element => (
          <QueryClientProvider client={appQueryClient}>
            {children}
          </QueryClientProvider>
        ),
      },
    );

    await waitFor(() => {
      expect(result.current.apps).toHaveLength(1);
      expect(statusListFn).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await result.current.appActions.onSetAsDefault({
        id: 'app-1',
        name: 'One',
      });
    });

    expect(domainServices.updateAppDetail).toHaveBeenCalledWith('app-1', {
      default: true,
    });
    await waitFor(() => {
      expect(statusListFn).toHaveBeenCalledTimes(2);
    });
  });

  const renderMyApps = async (
    apps: { id: string; name: string; default?: boolean }[],
  ): Promise<{ current: ReturnType<typeof useAppListLogic> }> => {
    boardIsReachableMock = true;
    domainServices.getApps.mockResolvedValue(apps);
    const Wrapper = createWrapper();
    const { result } = renderHook(() => useAppListLogic('my-apps'), {
      wrapper: ({ children }: PropsWithChildren): JSX.Element => (
        <IntlProvider locale="en">
          <Wrapper>{children}</Wrapper>
        </IntlProvider>
      ),
    });
    await waitFor(() => expect(result.current.apps).toHaveLength(apps.length));
    return result;
  };

  it('shows the Undo snackbar when an App is set as default', async () => {
    domainServices.updateAppDetail.mockResolvedValue('app-2');
    const result = await renderMyApps([
      { id: 'app-1', name: 'One', default: true },
      { id: 'app-2', name: 'Two' },
    ]);

    await act(async () => {
      await result.current.appActions.onSetAsDefault({
        id: 'app-2',
        name: 'Two',
      });
    });

    expect(domainServices.updateAppDetail).toHaveBeenCalledWith('app-2', {
      default: true,
    });
    expect(sendAppLabNotification).toHaveBeenCalledTimes(1);
    const props = vi.mocked(sendAppLabNotification).mock.calls[0][0];
    expect(props.message).toBe('Two is now your default App');
    expect(props.actions?.map((a) => a.text)).toEqual(['Undo']);
  });

  it('keeps the plain snackbar without Undo when the default is removed', async () => {
    domainServices.updateAppDetail.mockResolvedValue('app-1');
    const result = await renderMyApps([
      { id: 'app-1', name: 'One', default: true },
    ]);

    await act(async () => {
      await result.current.appActions.onSetAsDefault({
        id: 'app-1',
        name: 'One',
      });
    });

    expect(domainServices.updateAppDetail).toHaveBeenCalledWith('app-1', {
      default: false,
    });
    expect(sendAppLabNotification).toHaveBeenCalledTimes(1);
    const props = vi.mocked(sendAppLabNotification).mock.calls[0][0];
    expect(props.message).toBe('One removed as default App');
    expect(props.actions).toBeUndefined();
  });

  it('shows no snackbar when the update fails', async () => {
    domainServices.updateAppDetail.mockResolvedValue(undefined);
    const result = await renderMyApps([{ id: 'app-1', name: 'One' }]);

    await act(async () => {
      await result.current.appActions.onSetAsDefault({
        id: 'app-1',
        name: 'One',
      });
    });

    expect(sendAppLabNotification).not.toHaveBeenCalled();
  });
});
