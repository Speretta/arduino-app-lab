import { updateAppDetail } from '@cloud-editor-mono/domain/src/services/services-by-app/app-lab';
import { FormatMessage } from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';

import { queryClient } from '../../../../common/providers/data-fetching/QueryProvider';
import { BoardScopedQuery } from '../../../boardScopedQuery';
import { sendAppLabNotification } from '../../notifications';
import { defaultAppMessages as messages } from './messages';

// The snackbar ellipsis cuts the end of the message, so a long name is cut here to keep the rest visible.
export const MAX_APP_NAME_LENGTH = 30;

export const shortenAppName = (name: string): string =>
  name.length > MAX_APP_NAME_LENGTH
    ? `${name.slice(0, MAX_APP_NAME_LENGTH)}…`
    : name;

export const notifyDefaultAppSet = (
  app: { id: string; name: string },
  formatMessage: FormatMessage,
): void => {
  const appName = shortenAppName(app.name);

  const undo = async (): Promise<void> => {
    let result: string | undefined;
    try {
      result = await updateAppDetail(app.id, { default: false });
    } catch (e) {
      console.error('[default-app] undo failed', e);
    }

    if (result === undefined) {
      sendAppLabNotification({
        message: formatMessage(messages.undoFailed, { appName }),
        variant: 'error',
      });
      return;
    }

    queryClient.invalidateQueries({
      queryKey: [BoardScopedQuery.LIST_MY_APPS],
    });
  };

  sendAppLabNotification({
    message: formatMessage(messages.setAsDefault, { appName }),
    variant: 'success',
    actions: [
      {
        text: formatMessage(messages.undo),
        onClick: ({ dismiss }): void => {
          dismiss();
          undo();
        },
      },
    ],
  });
};
