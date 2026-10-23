import { appLabAppRelease } from '@cloud-editor-mono/images/assets/images/images-by-app/app-lab';
import { FormattedMessage } from 'react-intl';

import {
  Button,
  ButtonVariant,
} from '../../../components-by-app/app-lab/essential/button';
import { Checkbox } from '../../../essential/checkbox';
import { useI18n } from '../../../i18n/useI18n';
import { Medium, XSmall } from '../../../typography';
import { AppLabDialog } from '../app-lab-dialog/AppLabDialog';
import { createReleaseIntroDialogMessages as messages } from '../messages';
import styles from './create-release-intro-dialog.module.scss';

export type CreateReleaseIntroDialogLogic = () => {
  open: boolean;
  dontShowAgain: boolean;
  setDontShowAgain: (value: boolean) => void;
  onContinue: () => void;
  onOpenChange: (open: boolean) => void;
};

type CreateReleaseIntroDialogProps = {
  logic: CreateReleaseIntroDialogLogic;
};

const strong = (chunks: React.ReactNode): React.ReactNode => (
  <strong>{chunks}</strong>
);

export const CreateReleaseIntroDialog: React.FC<
  CreateReleaseIntroDialogProps
> = ({ logic }: CreateReleaseIntroDialogProps) => {
  const { open, dontShowAgain, setDontShowAgain, onContinue, onOpenChange } =
    logic();
  const { formatMessage } = useI18n();

  return (
    <AppLabDialog
      open={open}
      onOpenChange={onOpenChange}
      title={formatMessage(messages.dialogTitle)}
      onSubmit={onContinue}
      classes={{
        root: styles['root'],
        content: styles['content'],
        body: styles['body'],
      }}
    >
      <div className={styles['image']}>{appLabAppRelease}</div>
      <div className={styles['container']}>
        <div className={styles['description']}>
          <Medium className={styles['title']}>
            {formatMessage(messages.title)}
          </Medium>
          <XSmall>{formatMessage(messages.description)}</XSmall>
          <ul className={styles['points']}>
            <li>
              <FormattedMessage
                {...messages.pointDirectProduction}
                values={{ strong }}
              />
            </li>
            <li>
              <FormattedMessage
                {...messages.pointAppLabSharing}
                values={{ strong }}
              />
            </li>
          </ul>
        </div>
        <div className={styles['footer']}>
          <Checkbox isSelected={dontShowAgain} onChange={setDontShowAgain}>
            {formatMessage(messages.dontShowAgain)}
          </Checkbox>
          <Button variant={ButtonVariant.Primary} type="submit">
            {formatMessage(messages.continueButton)}
          </Button>
        </div>
      </div>
    </AppLabDialog>
  );
};
