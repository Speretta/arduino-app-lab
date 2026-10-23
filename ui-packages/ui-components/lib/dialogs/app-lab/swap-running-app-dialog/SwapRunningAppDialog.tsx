import { Play } from '@cloud-editor-mono/images/assets/icons';

import {
  AppLabDialog,
  Button,
  ButtonVariant,
} from '../../../components-by-app/app-lab';
import { useI18n } from '../../../i18n/useI18n';
import { Medium, XXSmall } from '../../../typography';
import { swapRunningAppDialogMessages as messages } from '../messages';
import styles from './swap-running-app-dialog.module.scss';
import { SwapRunningAppDialogLogic } from './swapRunningAppDialog.type';

export interface SwapRunningDialogProps {
  themeClass?: string;
  swapRunningAppDialogLogic: SwapRunningAppDialogLogic;
}

type SwapRunningAppDialogProps = { logic: SwapRunningAppDialogLogic };

export const SwapRunningAppDialog: React.FC<SwapRunningAppDialogProps> = ({
  logic,
}: SwapRunningAppDialogProps) => {
  const { formatMessage } = useI18n();
  const {
    open,
    setOpen,
    runningAppName,
    newAppName,
    runningAppIsDefault,
    handleSwap,
  } = logic();

  const nameTags = (className: string): Record<string, () => JSX.Element> => ({
    running: () => (
      <span className={className} title={runningAppName}>
        {runningAppName}
      </span>
    ),
    new: () => (
      <span className={className} title={newAppName}>
        {newAppName}
      </span>
    ),
  });
  const values = { runningAppName, newAppName };

  return (
    <AppLabDialog
      open={open}
      onOpenChange={setOpen}
      title={formatMessage(messages.dialogTitle)}
      footer={
        <>
          <Button
            variant={ButtonVariant.Secondary}
            onClick={(): void => setOpen(false)}
          >
            {formatMessage(messages.cancelButton)}
          </Button>
          <Button variant={ButtonVariant.Primary} onClick={handleSwap}>
            {formatMessage(messages.confirmButton)}
          </Button>
        </>
      }
      classes={{
        root: styles['root'],
        content: styles['content'],
        body: styles['body'],
      }}
    >
      <Play className={styles['body-icon']} />
      <Medium className={styles['body-title']}>
        {formatMessage(messages.dialogBodyTitle, {
          ...values,
          ...nameTags(styles['body-title-name']),
        })}
      </Medium>
      <XXSmall className={styles['body-description']}>
        {formatMessage(messages.dialogBodyDescription, {
          ...values,
          ...nameTags(styles['body-description-name']),
        })}
        {runningAppIsDefault ? (
          <>
            {' '}
            {formatMessage(messages.defaultAppNote, {
              ...values,
              ...nameTags(styles['body-description-name']),
            })}
          </>
        ) : null}
      </XXSmall>
    </AppLabDialog>
  );
};
