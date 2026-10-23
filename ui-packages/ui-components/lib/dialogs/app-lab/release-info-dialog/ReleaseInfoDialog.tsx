import {
  ReleaseDetails,
  ReleaseSummary,
} from '../../../components-by-app/app-lab/app-release';
import {
  Button,
  ButtonSize,
  ButtonVariant,
} from '../../../components-by-app/app-lab/essential/button';
import { useI18n } from '../../../i18n/useI18n';
import { AppLabDialog } from '../app-lab-dialog/AppLabDialog';
import { releaseInfoDialogMessages as messages } from '../messages';
import styles from './release-info-dialog.module.scss';

export type ReleaseInfoDialogLogic = () => {
  open: boolean;
  release?: ReleaseDetails;
  onOpenChange: (open: boolean) => void;
};

type ReleaseInfoDialogProps = { logic: ReleaseInfoDialogLogic };

export const ReleaseInfoDialog: React.FC<ReleaseInfoDialogProps> = ({
  logic,
}: ReleaseInfoDialogProps) => {
  const { open, release, onOpenChange } = logic();
  const { formatMessage } = useI18n();

  return (
    <AppLabDialog
      open={open}
      onOpenChange={onOpenChange}
      title={formatMessage(messages.dialogTitle)}
      classes={{ content: styles['content'], body: styles['body'] }}
      footer={
        <Button
          variant={ButtonVariant.Primary}
          size={ButtonSize.Small}
          onClick={(): void => onOpenChange(false)}
        >
          {formatMessage(messages.closeButton)}
        </Button>
      }
    >
      {release ? <ReleaseSummary release={release} /> : null}
    </AppLabDialog>
  );
};
