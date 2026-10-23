import { Board } from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const board = (
  serial: string,
  connectionType: Board['connectionType'],
  address = '',
): Board => ({
  id: `${connectionType}-${serial}`,
  name: `board ${serial}`,
  fqbn: 'arduino:zephyr:unoq',
  type: 'UNO Q',
  connectionType,
  protocol: connectionType === 'Network' ? 'network' : 'serial',
  serial,
  address,
});

const load = async (): Promise<
  typeof import('./boardService.utils')['filterBoards']
> => (await import('./boardService.utils')).filterBoards;

// Waits out the storage module's two open retries (250 ms, then 1 s).
const settle = async <T>(pending: Promise<T>): Promise<T> => {
  await vi.advanceTimersByTimeAsync(1250);
  return pending;
};

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  // WebKit's error when the database directory is not writable.
  vi.stubGlobal('indexedDB', {
    open: (): never => {
      throw new DOMException(
        'Unable to open database file on disk',
        'UnknownError',
      );
    },
  });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('filterBoards when IndexedDB cannot open', () => {
  it('keeps every board, the local one included', async () => {
    const filterBoards = await load();
    const boards = [
      board('local', 'Local'),
      board('usb-1', 'USB', '/dev/ttyACM0'),
      board('net-1', 'Network', '192.168.1.20'),
    ];

    await expect(settle(filterBoards(boards))).resolves.toEqual(boards);
  });

  it('still hides the network entry of a board seen on USB in the last 70 s', async () => {
    const filterBoards = await load();
    const onNetwork = board('s-1', 'Network', '192.168.1.21');

    await settle(filterBoards([board('s-1', 'USB', '/dev/ttyACM0')]));
    expect(await filterBoards([onNetwork])).toEqual([]);

    await vi.advanceTimersByTimeAsync(70_001);
    expect(await filterBoards([onNetwork])).toEqual([onNetwork]);
  });
});
