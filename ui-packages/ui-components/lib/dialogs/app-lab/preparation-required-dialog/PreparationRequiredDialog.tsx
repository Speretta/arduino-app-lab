import {
  InfoSetup as InfoIconOutline,
  Warning,
} from '@cloud-editor-mono/images/assets/icons';

import {
  Button,
  ButtonSize,
  ButtonVariant,
} from '../../../components-by-app/app-lab/essential/button';
import { XSmall, XXSmall } from '../../../components-by-app/shared';
import { useI18n } from '../../../i18n/useI18n';
import { AppLabDialog } from '../app-lab-dialog/AppLabDialog';
import { preparationRequiredDialogMessages as messages } from '../messages';
import styles from './preparation-required-dialog.module.scss';

export type PreparationRequiredDialogLogic = () => {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartPreparation: () => void;
};

type PreparationRequiredDialogProps = { logic: PreparationRequiredDialogLogic };

// Shown when an installed release is opened before its preparation has run.
export const PreparationRequiredDialog: React.FC<
  PreparationRequiredDialogProps
> = ({ logic }: PreparationRequiredDialogProps) => {
  const { open, onOpenChange, onStartPreparation } = logic();
  const { formatMessage } = useI18n();

  return (
    <AppLabDialog
      open={open}
      onOpenChange={onOpenChange}
      title={formatMessage(messages.dialogTitle)}
      classes={{ content: styles['content'], body: styles['body'] }}
      footer={
        <>
          <Button
            variant={ButtonVariant.Secondary}
            size={ButtonSize.Small}
            onClick={(): void => onOpenChange(false)}
          >
            {formatMessage(messages.cancelButton)}
          </Button>
          <Button
            variant={ButtonVariant.Primary}
            size={ButtonSize.Small}
            onClick={onStartPreparation}
          >
            {formatMessage(messages.startButton)}
          </Button>
        </>
      }
    >
      <div className={styles['body-content']}>
        <span className={styles['warning-icon']}>
          <Warning />
        </span>
        <XSmall className={styles['title']}>
          {formatMessage(messages.title)}
        </XSmall>
        <XXSmall className={styles['description']}>
          {formatMessage(messages.description)}
        </XXSmall>
        <div className={styles['hint']}>
          <InfoIconOutline />
          <span>{formatMessage(messages.networkHint)}</span>
        </div>
      </div>
    </AppLabDialog>
  );
};
