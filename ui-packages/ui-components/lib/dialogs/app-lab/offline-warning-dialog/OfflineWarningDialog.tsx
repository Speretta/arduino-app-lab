import {
  Button,
  ButtonAppearance,
  ButtonSize,
  ButtonVariant,
} from '../../../components-by-app/app-lab';
import { useI18n } from '../../../i18n/useI18n';
import { AppLabDialog } from '../app-lab-dialog/AppLabDialog';
import { offlineWarningDialogMessages as messages } from '../messages';
import styles from './OfflineWarningDialog.module.scss';
import { OfflineWarningDialogLogic } from './OfflineWarningDialog.type';

type OfflineWarningDialogProps = {
  logic: OfflineWarningDialogLogic;
};

export const OfflineWarningDialog: React.FC<OfflineWarningDialogProps> = ({
  logic,
}: OfflineWarningDialogProps) => {
  const { formatMessage } = useI18n();

  const { open, onOpenChange, onContinue, onNetworkSettings } = logic();

  return (
    <AppLabDialog
      open={open}
      onOpenChange={onOpenChange}
      title={formatMessage(messages.dialogTitle)}
      classes={{
        body: styles['body'],
      }}
      footer={
        <>
          <Button
            size={ButtonSize.Small}
            appearance={ButtonAppearance.Destructive}
            variant={ButtonVariant.Secondary}
            onClick={onContinue}
          >
            {formatMessage(messages.continueButton)}
          </Button>
          <Button
            size={ButtonSize.Small}
            type="submit"
            onClick={onNetworkSettings}
          >
            {formatMessage(messages.networkSettingsButton)}
          </Button>
        </>
      }
    >
      <div className={styles['inner']}>
        <h2 className={styles['title']}>
          {formatMessage(messages.dialogBodyTitle)}
        </h2>

        <p className={styles['description']}>
          {formatMessage(messages.dialogBodyDescription)}
        </p>

        <ul className={styles['list']}>
          <li>{formatMessage(messages.feature1)}</li>
          <li>{formatMessage(messages.feature2)}</li>
          <li>{formatMessage(messages.feature3)}</li>
          <li>{formatMessage(messages.feature4)}</li>
          <li>{formatMessage(messages.feature5)}</li>
        </ul>

        <p className={styles['description']}>
          {formatMessage(messages.dialogBodyFooter)}
        </p>
      </div>
    </AppLabDialog>
  );
};
