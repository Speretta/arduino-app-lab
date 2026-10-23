import { beforeEach, describe, expect, it, vi } from 'vitest';

import { queryClient } from '../../../../common/providers/data-fetching/QueryProvider';
import { BoardScopedQuery } from '../../../boardScopedQuery';
import { sendAppLabNotification } from '../../notifications';
import {
  MAX_APP_NAME_LENGTH,
  notifyDefaultAppSet,
  shortenAppName,
} from './notifyDefaultAppSet';

vi.mock(
  '@cloud-editor-mono/domain/src/services/services-by-app/app-lab',
  () => ({ updateAppDetail: vi.fn() }),
);

vi.mock('../../notifications', () => ({ sendAppLabNotification: vi.fn() }));

const { updateAppDetail } = vi.mocked(
  await import(
    '@cloud-editor-mono/domain/src/services/services-by-app/app-lab'
  ),
);
const notify = vi.mocked(sendAppLabNotification);

const formatMessage = (
  descriptor: { defaultMessage?: unknown },
  values?: Record<string, unknown>,
): string =>
  String(descriptor.defaultMessage).replace(/\{(\w+)\}/g, (_m, key) =>
    String(values?.[key]),
  );

const APP = { id: 'app-1', name: 'Weather Station' };

const pressUndo = async (): Promise<() => void> => {
  const dismiss = vi.fn();
  notify.mock.calls[0][0].actions?.[0].onClick({ dismiss });
  await vi.waitFor(() => expect(updateAppDetail).toHaveBeenCalled());
  // Let the undo request settle.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return dismiss;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('notifyDefaultAppSet', () => {
  it('shows a success snackbar with one Undo action', () => {
    notifyDefaultAppSet(APP, formatMessage);

    expect(notify).toHaveBeenCalledTimes(1);
    const props = notify.mock.calls[0][0];
    expect(props.message).toBe('Weather Station is now your default App');
    expect(props.variant).toBe('success');
    expect(props.actions?.map((a) => a.text)).toEqual(['Undo']);
  });

  it('removes the default from that App on Undo and closes the snackbar', async () => {
    updateAppDetail.mockResolvedValue('app-1');
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    notifyDefaultAppSet(APP, formatMessage);

    const dismiss = await pressUndo();

    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(updateAppDetail).toHaveBeenCalledWith('app-1', { default: false });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: [BoardScopedQuery.LIST_MY_APPS],
    });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'returns no id',
      (): void => void updateAppDetail.mockResolvedValue(undefined),
    ],
    [
      'throws',
      (): void => void updateAppDetail.mockRejectedValue(new Error('x')),
    ],
  ])(
    'shows an error snackbar when the Undo request %s',
    async (_name, setup) => {
      setup();
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      notifyDefaultAppSet(APP, formatMessage);

      await pressUndo();

      expect(notify).toHaveBeenCalledTimes(2);
      expect(notify.mock.calls[1][0]).toMatchObject({
        message: 'Failed to remove Weather Station as default App',
        variant: 'error',
      });
    },
  );

  it('shortens only a long App name and keeps the rest of the message', () => {
    const longName = 'a'.repeat(MAX_APP_NAME_LENGTH + 10);
    notifyDefaultAppSet({ id: 'app-1', name: longName }, formatMessage);

    expect(notify.mock.calls[0][0].message).toBe(
      `${'a'.repeat(MAX_APP_NAME_LENGTH)}… is now your default App`,
    );
  });

  it('keeps a name at the limit whole', () => {
    const name = 'a'.repeat(MAX_APP_NAME_LENGTH);
    expect(shortenAppName(name)).toBe(name);
  });
});
