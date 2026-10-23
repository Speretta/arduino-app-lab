import {
  appLabMediaCarrier,
  appLabMediaCarrierVentunoQ,
} from '@cloud-editor-mono/images/assets/images/images-by-app/app-lab';

import { Button, ButtonVariant } from '../../../components-by-app/app-lab';
import { useI18n } from '../../../i18n/useI18n';
import { Medium, XSmall } from '../../../typography';
import { AppLabDialog } from '../app-lab-dialog/AppLabDialog';
import { boardExtensionsAttachDialogMessages as messages } from '../messages';
import styles from './board-extensions-attach-dialog.module.scss';

export type BoardExtensionsAttachDialogLogic = () => {
  open: boolean;
  isHat: boolean;
  isVentunoQ: boolean;
  confirm: () => void;
  onOpenChange: (open: boolean) => void;
};

type BoardExtensionsAttachDialogProps = {
  logic: BoardExtensionsAttachDialogLogic;
};

export const BoardExtensionsAttachDialog: React.FC<
  BoardExtensionsAttachDialogProps
> = ({ logic }: BoardExtensionsAttachDialogProps) => {
  const { open, isHat, isVentunoQ, confirm, onOpenChange } = logic();

  const closeDialog = (): void => {
    onOpenChange(false);
  };

  const { formatMessage } = useI18n();

  return (
    <AppLabDialog
      open={open}
      onOpenChange={(open): void => (open ? onOpenChange(open) : closeDialog())}
      title={formatMessage(
        isHat ? messages.dialogHatTitle : messages.dialogCarrierTitle,
      )}
      onSubmit={confirm}
      classes={{
        root: styles['root'],
        content: styles['content'],
        body: styles['body'],
      }}
    >
      <div className={styles['image-container']}>
        {isHat || isVentunoQ ? appLabMediaCarrierVentunoQ : appLabMediaCarrier}
      </div>
      <div className={styles['container']}>
        <div className={styles['description-container']}>
          <Medium className={styles['title']}>
            {formatMessage(
              isHat
                ? messages.dialogHatBodyTitle
                : messages.dialogCarrierBodyTitle,
            )}
          </Medium>
          <XSmall>
            {formatMessage(
              isHat
                ? messages.dialogHatBodyDescription
                : messages.dialogCarrierBodyDescription,
              {
                bold: (text: string) => <strong>{text}</strong>,
              },
            )}
          </XSmall>
          {!isHat && (
            <XSmall>
              {formatMessage(messages.dialogCarrierBodyDescription2)}
            </XSmall>
          )}
        </div>
        <div className={styles['footer-container']}>
          <Button variant={ButtonVariant.Primary} type="submit">
            {formatMessage(messages.confirmButton)}
          </Button>
        </div>
      </div>
    </AppLabDialog>
  );
};
