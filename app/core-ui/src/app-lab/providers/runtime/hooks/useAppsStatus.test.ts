import { getApps } from '@cloud-editor-mono/domain/src/services/services-by-app/app-lab';
import {
  AppDetailedInfo,
  EventSourceHandlers,
  StreamEventType,
} from '@cloud-editor-mono/infrastructure';
import { Board } from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, FC, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useBoardLifecycleStore } from '../../../store/boardLifecycle';
import useAppsStatus from './useAppsStatus';

const h = vi.hoisted(() => ({
  statusHandlers: [] as EventSourceHandlers[],
  statusSignals: [] as (AbortSignal | undefined)[],
}));

vi.mock(
  '@cloud-editor-mono/domain/src/services/services-by-app/app-lab',
  () => ({
    getApps: vi.fn(),
    getAppStatus: vi.fn(
      async (
        handlers: EventSourceHandlers,
        abortController?: AbortController,
      ) => {
        h.statusHandlers.push(handlers);
        h.statusSignals.push(abortController?.signal);
      },
    ),
  }),
);

const makeBoard = (overrides: Partial<Board>): Board => ({
  id: 'id',
  name: 'name',
  type: 'Arduino Uno Q',
  fqbn: 'fqbn',
  connectionType: 'Network',
  protocol: 'serial',
  serial: '',
  address: '',
  ...overrides,
});

const usbBoard = makeBoard({ connectionType: 'USB', serial: 'VQ-0001' });
const networkBoardA = makeBoard({ address: '192.168.1.10' });
const networkBoardB = makeBoard({ address: '192.168.1.11' });

const openStream = async (index: number): Promise<void> => {
  await act(async () => {
    await h.statusHandlers[index].onopen?.(new Response());
  });
};

const userApp = {
  id: 'user:my-app',
  name: 'My App',
  status: 'stopped',
  example: false,
  default: false,
} as AppDetailedInfo;

const exampleApp = {
  id: 'examples:blink',
  name: 'Blink',
  status: 'stopped',
  example: true,
  default: false,
} as AppDetailedInfo;

const renderAppsStatus = (): ReturnType<
  typeof renderHook<ReturnType<typeof useAppsStatus>, unknown>
> => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper: FC<{ children: ReactNode }> = ({ children }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return renderHook(() => useAppsStatus(), { wrapper });
};

describe('useAppsStatus', () => {
  beforeEach(() => {
    vi.mocked(getApps).mockReset();
    h.statusHandlers.length = 0;
    h.statusSignals.length = 0;
    useBoardLifecycleStore.getState().setBoardIsReachable(true);
    useBoardLifecycleStore.getState().setBoardIsFlashing(false);
    useBoardLifecycleStore.getState().setSelectedConnectedBoard(undefined);
  });

  it('reads the default app from the full app list', async () => {
    vi.mocked(getApps).mockResolvedValue([
      { ...userApp, default: true },
      exampleApp,
    ]);

    const { result } = renderAppsStatus();

    await waitFor(() => expect(result.current.defaultApp?.id).toBe(userApp.id));
    expect(getApps).toHaveBeenCalledWith({ query: {} });
    expect(getApps).not.toHaveBeenCalledWith({
      query: { filter: 'default' },
    });
  });

  it('finds the default app when it is an example', async () => {
    vi.mocked(getApps).mockResolvedValue([
      userApp,
      { ...exampleApp, default: true },
    ]);

    const { result } = renderAppsStatus();

    await waitFor(() =>
      expect(result.current.defaultApp?.id).toBe(exampleApp.id),
    );
  });

  it('follows the list after an SSE app event without a default flag', async () => {
    vi.mocked(getApps).mockResolvedValueOnce([
      { ...userApp, default: true },
      exampleApp,
    ]);

    const { result } = renderAppsStatus();

    await waitFor(() => expect(result.current.defaultApp?.id).toBe(userApp.id));
    await waitFor(() => expect(h.statusHandlers).toHaveLength(1));

    vi.mocked(getApps).mockResolvedValue([
      userApp,
      { ...exampleApp, default: true },
    ]);

    act(() => {
      h.statusHandlers[0].onmessage?.({
        id: '',
        event: StreamEventType.App,
        data: JSON.stringify({ id: exampleApp.id, status: 'stopped' }),
      });
    });

    await waitFor(() =>
      expect(result.current.defaultApp?.id).toBe(exampleApp.id),
    );
  });

  describe('status stream and the connected board', () => {
    beforeEach(() => {
      vi.mocked(getApps).mockResolvedValue([]);
    });

    it.each([
      ['a USB board to a network board', usbBoard, networkBoardA],
      ['two network boards with empty serials', networkBoardA, networkBoardB],
    ])(
      'aborts the old stream and connects once after a switch from %s',
      async (_label, fromBoard, toBoard) => {
        useBoardLifecycleStore.getState().setSelectedConnectedBoard(fromBoard);
        renderAppsStatus();
        await waitFor(() => expect(h.statusHandlers).toHaveLength(1));
        await openStream(0);

        act(() => {
          useBoardLifecycleStore.getState().setSelectedConnectedBoard(toBoard);
        });

        await waitFor(() => expect(h.statusHandlers).toHaveLength(2));
        expect(h.statusSignals[0]?.aborted).toBe(true);

        await openStream(1);
        expect(h.statusHandlers).toHaveLength(2);
        expect(h.statusSignals[1]?.aborted).toBe(false);
      },
    );

    it('keeps the stream when the same board is set again', async () => {
      useBoardLifecycleStore.getState().setSelectedConnectedBoard(usbBoard);
      renderAppsStatus();
      await waitFor(() => expect(h.statusHandlers).toHaveLength(1));
      await openStream(0);

      act(() => {
        useBoardLifecycleStore
          .getState()
          .setSelectedConnectedBoard({ ...usbBoard, name: 'renamed' });
        useBoardLifecycleStore.getState().setBoardIsReachable(true);
      });

      expect(h.statusHandlers).toHaveLength(1);
      expect(h.statusSignals[0]?.aborted).toBe(false);
    });

    it('aborts the stream while the board is flashing', async () => {
      useBoardLifecycleStore.getState().setSelectedConnectedBoard(usbBoard);
      renderAppsStatus();
      await waitFor(() => expect(h.statusHandlers).toHaveLength(1));
      await openStream(0);

      act(() => {
        useBoardLifecycleStore.getState().setBoardIsFlashing(true);
      });

      expect(h.statusSignals[0]?.aborted).toBe(true);
      expect(h.statusHandlers).toHaveLength(1);
    });
  });
});
