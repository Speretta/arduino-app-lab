import { EventSourceHandlers } from '@cloud-editor-mono/infrastructure';
import { Board } from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBoardLifecycleStore } from '../store/boardLifecycle';
import { useBoardResourcesStore } from '../store/boardResources';
import { useBoardResourcesStream } from './useBoardResourcesStream';

const opened: { handlers: EventSourceHandlers }[] = [];

vi.mock(
  '@cloud-editor-mono/domain/src/services/services-by-app/app-lab',
  async () => {
    const actual = await vi.importActual<
      typeof import('@cloud-editor-mono/domain/src/services/services-by-app/app-lab')
    >('@cloud-editor-mono/domain/src/services/services-by-app/app-lab');

    return {
      ...actual,
      getSystemResources: vi.fn(
        async (
          handlers: EventSourceHandlers,
          abortController?: AbortController,
        ) => {
          opened.push({ handlers });
          await handlers.onopen?.(new Response());
          void abortController;
        },
      ),
    };
  },
);

const makeBoard = (overrides: Partial<Board>): Board => ({
  id: 'id',
  name: 'name',
  type: 'Arduino Uno Q',
  fqbn: 'fqbn',
  connectionType: 'Network',
  protocol: 'serial',
  // Network boards commonly report an empty serial, so identity comes from the
  // address (see getBoardCacheId).
  serial: '',
  address: '',
  ...overrides,
});

const netA = makeBoard({ address: '192.168.1.10' });
const netB = makeBoard({ address: '192.168.1.11' });

const connect = (board: Board | undefined): void => {
  act(() => {
    useBoardLifecycleStore.setState({
      selectedConnectedBoard: board,
      boardIsReachable: !!board,
      boardIsFlashing: false,
    });
  });
};

describe('useBoardResourcesStream', () => {
  beforeEach(() => {
    opened.length = 0;
    useBoardResourcesStore.getState().reset();
    useBoardLifecycleStore.setState({
      selectedConnectedBoard: undefined,
      boardIsReachable: false,
      boardIsFlashing: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears the previous board resources when a network board is swapped', () => {
    const { unmount } = renderHook(() => useBoardResourcesStream());

    connect(netA);
    act(() => {
      useBoardResourcesStore
        .getState()
        .applyMessage('cpu', { used_percent: 42 }, false);
    });
    expect(useBoardResourcesStore.getState().resources?.cpuPercentage).toBe(42);

    connect(netB);
    expect(useBoardResourcesStore.getState().resources).toBeUndefined();

    unmount();
  });

  it('does not reconnect after unmount', () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useBoardResourcesStream());

    connect(netA);
    expect(opened).toHaveLength(1);

    act(() => {
      opened[0].handlers.onclose?.();
    });

    unmount();
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(opened).toHaveLength(1);
  });
});
