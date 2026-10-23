import { Switch } from '@cloud-editor-mono/images/assets/icons';
import { useI18n } from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';

import { messages } from '../../messages';
import { useBoardSwitchStore } from '../../store';
import { ConfirmDialog } from '../../ui';

// Asks before a board switch that would stop the agent mid-turn. Self-contained: the switch itself is
// parked in the store by requestBoardSwitch, so the host only has to mount this.
export const SwitchBoardDialog: React.FC = () => {
  const pending = useBoardSwitchStore((state) => state.pending);
  const setPending = useBoardSwitchStore((state) => state.setPending);
  const confirmPending = useBoardSwitchStore((state) => state.confirmPending);
  const { formatMessage } = useI18n();

  if (!pending) {
    return null;
  }

  return (
    <ConfirmDialog
      title={formatMessage(messages.switchBoardDialogTitle)}
      Icon={Switch}
      iconTone="error"
      heading={formatMessage(messages.switchBoardDialogHeading)}
      description={formatMessage(messages.switchBoardDialogBody, {
        boardName:
          pending.currentBoardName ||
          formatMessage(messages.switchBoardDialogBoardFallback),
      })}
      cancelLabel={formatMessage(messages.cancel)}
      confirmLabel={formatMessage(messages.switchBoardDialogConfirm)}
      onConfirm={confirmPending}
      onClose={(): void => setPending(undefined)}
    />
  );
};
