import { EventSourceHandlers } from '@cloud-editor-mono/infrastructure';
import { UpdaterStatus } from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useUpdater } from './updaterContextProvider.logic';

vi.mock('../../store/boardLifecycle', async () => {
  const actual = await vi.importActual<
    typeof import('../../store/boardLifecycle')
  >('../../store/boardLifecycle');

  return {
    ...actual,
    useBoardLifecycleStore: vi.fn((selector) =>
      selector({
        boardIsReachable: true,
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
      applyBoardUpdate: vi.fn(),
      checkAndApplyUpdate: vi.fn(),
      checkBoardUpdate: vi.fn(),
      getBoardUpdateLogs: vi.fn(),
      getCurrentVersion: vi.fn(),
      getMandatoryUpdatesList: vi.fn(),
      getReleaseImageSrc: vi.fn(),
      getReleaseNotes: vi.fn(),
      getVersion: vi.fn(),
      isBoard: vi.fn(),
      isFFEnabled: vi.fn(),
      newVersion: vi.fn(),
    };
  },
);

const domainServices = vi.mocked(
  await import(
    '@cloud-editor-mono/domain/src/services/services-by-app/app-lab'
  ),
);

const createWrapper = () =>
  function UpdaterTestWrapper({ children }: PropsWithChildren): JSX.Element {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };

/**
 * Starts a board update and hands back the stream handlers the updater
 * registered, so a test can push events at it the way the board would.
 */
const startUpdateAndCaptureStream = async (): Promise<{
  result: { current: ReturnType<typeof useUpdater> };
  handlers: EventSourceHandlers;
  /** The handlers of the stream opened most recently: a retry opens a new one. */
  latestHandlers: () => EventSourceHandlers;
}> => {
  let handlers: EventSourceHandlers | undefined;
  domainServices.getBoardUpdateLogs.mockImplementation(async (h) => {
    handlers = h;
  });

  const { result } = renderHook(() => useUpdater(), {
    wrapper: createWrapper(),
  });

  await act(async () => {
    await result.current.checkForUpdates();
  });

  act(() => {
    result.current.startUpdate();
  });

  await waitFor(() => expect(handlers).toBeDefined());

  return {
    result,
    handlers: handlers as EventSourceHandlers,
    latestHandlers: () => handlers as EventSourceHandlers,
  };
};

beforeEach(() => {
  vi.clearAllMocks();

  domainServices.isBoard.mockResolvedValue(true);
  domainServices.isFFEnabled.mockReturnValue(false);
  domainServices.getCurrentVersion.mockResolvedValue('1.0.0');
  domainServices.getMandatoryUpdatesList.mockResolvedValue([]);
  // No App Lab update: the board update is the one that reports progress.
  domainServices.newVersion.mockResolvedValue('');
  domainServices.applyBoardUpdate.mockResolvedValue(true);
  domainServices.checkAndApplyUpdate.mockResolvedValue(undefined);
  domainServices.getReleaseNotes.mockResolvedValue('release notes');
  domainServices.getReleaseImageSrc.mockReturnValue('release-image.png');
  domainServices.checkBoardUpdate.mockResolvedValue({
    updates: [{ name: 'arduino-app-lab', to_version: '1.1.0' }],
  });
});

describe('useUpdater - board update progress', () => {
  it('starts without a percentage, then follows the progress events', async () => {
    const { result, handlers } = await startUpdateAndCaptureStream();

    expect(result.current.boardUpdateProgress).toBeUndefined();

    act(() => {
      handlers.onmessage?.({
        id: '',
        event: 'progress',
        data: '{"step":"docker images download","progress":44}',
      });
    });

    expect(result.current.boardUpdateProgress).toBe(44);

    act(() => {
      handlers.onmessage?.({
        id: '',
        event: 'progress',
        data: '{"step":"upgrade completed","progress":100}',
      });
    });

    expect(result.current.boardUpdateProgress).toBe(100);
  });

  it('drops the percentage of the previous run when a retry starts', async () => {
    const { result, handlers, latestHandlers } =
      await startUpdateAndCaptureStream();

    act(() => {
      handlers.onmessage?.({
        id: '',
        event: 'progress',
        data: '{"step":"docker images download","progress":44}',
      });
    });

    expect(result.current.boardUpdateProgress).toBe(44);

    // The run fails and the dialog offers the update again.
    act(() => {
      result.current.setStatus(UpdaterStatus.UpdateFailed);
    });

    act(() => {
      result.current.setStatus(UpdaterStatus.UpdateAvailable);
    });

    act(() => {
      result.current.startUpdate();
    });

    // The retry is indeterminate until its own first progress event: it must
    // not resume at the percentage the failed run died on.
    expect(result.current.boardUpdateProgress).toBeUndefined();

    act(() => {
      latestHandlers().onmessage?.({
        id: '',
        event: 'progress',
        data: '{"step":"update index","progress":5}',
      });
    });

    expect(result.current.boardUpdateProgress).toBe(5);
  });

  it('drops the board percentage when the App Lab update takes over', async () => {
    // Off the board, an App Lab update follows the board one.
    domainServices.isBoard.mockResolvedValue(false);
    domainServices.newVersion.mockResolvedValue('2.0.0');

    const { result, handlers } = await startUpdateAndCaptureStream();

    act(() => {
      handlers.onmessage?.({
        id: '',
        event: 'progress',
        data: '{"step":"docker images download","progress":44}',
      });
    });

    expect(result.current.boardUpdateProgress).toBe(44);

    await act(async () => {
      handlers.onmessage?.({
        id: '',
        event: 'done',
        data: '"upgrade completed"',
      });
    });

    // The App Lab phase reports no progress of its own, so the bar goes back to
    // indeterminate rather than sitting on the board update's last percentage.
    expect(result.current.boardLogs).toContain('Starting App Lab update...');
    expect(result.current.appUpdateSucceeded).toBe(true);
    expect(result.current.boardUpdateProgress).toBeUndefined();
  });

  it('rounds to an integer and clamps to 0-100', async () => {
    const { result, handlers } = await startUpdateAndCaptureStream();

    const progressValues = [43.6, 120, -5];
    const expected = [44, 100, 0];

    progressValues.forEach((progress, index) => {
      act(() => {
        handlers.onmessage?.({
          id: '',
          event: 'progress',
          data: `{"step":"apt upgrade","progress":${progress}}`,
        });
      });

      expect(result.current.boardUpdateProgress).toBe(expected[index]);
    });
  });

  it('keeps progress events out of the log panel', async () => {
    const { result, handlers } = await startUpdateAndCaptureStream();

    const logsBefore = result.current.boardLogs.length;

    act(() => {
      handlers.onmessage?.({
        id: '',
        event: 'progress',
        data: '{"step":"docker images download","progress":44}',
      });
    });

    expect(result.current.boardLogs).toHaveLength(logsBefore);
    expect(result.current.boardLogs.some((log) => log.includes('docker'))).toBe(
      false,
    );
  });

  it('still prints log events', async () => {
    const { result, handlers } = await startUpdateAndCaptureStream();

    act(() => {
      handlers.onmessage?.({
        id: '',
        event: 'log',
        data: '"updating package: arduino-app-lab"',
      });
    });

    expect(result.current.boardLogs).toContain(
      'updating package: arduino-app-lab',
    );
  });
});

describe('useUpdater - malformed progress payloads', () => {
  /** Drives the bar to 44%, so a payload that is ignored is visible as such. */
  const startAt44 = async (): Promise<{
    result: { current: ReturnType<typeof useUpdater> };
    push: (data: string) => void;
  }> => {
    const { result, handlers } = await startUpdateAndCaptureStream();

    const push = (data: string): void => {
      act(() => {
        handlers.onmessage?.({ id: '', event: 'progress', data });
      });
    };

    push('{"step":"docker images download","progress":44}');
    expect(result.current.boardUpdateProgress).toBe(44);

    return { result, push };
  };

  it.each([
    ['a percentage sent as a string', '{"step":"apt upgrade","progress":"70"}'],
    ['a missing percentage', '{"step":"apt upgrade"}'],
    [
      'a percentage that is not numeric',
      '{"step":"apt upgrade","progress":"abc"}',
    ],
    ['a null payload', 'null'],
    ['a bare number', '42'],
    ['a bare string', '"apt upgrade"'],
    ['malformed JSON', '{"step":"apt upgrade","progress":'],
  ])('ignores %s and holds the last percentage', async (_case, data) => {
    const logged = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const { result, push } = await startAt44();

    push(data);

    expect(result.current.boardUpdateProgress).toBe(44);
    expect(logged).toHaveBeenCalled();

    logged.mockRestore();
  });

  it('clamps a percentage too large to represent', async () => {
    const { result, push } = await startAt44();

    push('{"step":"apt upgrade","progress":1e999}');
    expect(result.current.boardUpdateProgress).toBe(100);

    push('{"step":"apt upgrade","progress":-1e999}');
    expect(result.current.boardUpdateProgress).toBe(0);
  });
});
