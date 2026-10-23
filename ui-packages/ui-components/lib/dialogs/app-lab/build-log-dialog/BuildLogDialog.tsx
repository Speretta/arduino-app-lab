import { Duplicate } from '@cloud-editor-mono/images/assets/icons';
import clsx from 'clsx';

import {
  Button,
  ButtonSize,
  ButtonVariant,
} from '../../../components-by-app/app-lab/essential/button';
import { useI18n } from '../../../i18n/useI18n';
import { AppLabDialog } from '../app-lab-dialog/AppLabDialog';
import { buildLogDialogMessages as messages } from '../messages';
import styles from './build-log-dialog.module.scss';

export interface BuildLogLine {
  text: string;
  kind: 'info' | 'error';
}

export type BuildLogDialogLogic = () => {
  open: boolean;
  lines: BuildLogLine[];
  onCopy: () => void;
  onOpenChange: (open: boolean) => void;
};

type BuildLogDialogProps = { logic: BuildLogDialogLogic };

export const BuildLogDialog: React.FC<BuildLogDialogProps> = ({
  logic,
}: BuildLogDialogProps) => {
  const { open, lines, onCopy, onOpenChange } = logic();
  const { formatMessage } = useI18n();

  return (
    <AppLabDialog
      open={open}
      onOpenChange={onOpenChange}
      title={formatMessage(messages.dialogTitle)}
      classes={{
        content: styles['content'],
        body: styles['body'],
        footer: styles['footer'],
      }}
      footer={
        <>
          <Button
            variant={ButtonVariant.Tertiary}
            size={ButtonSize.Small}
            Icon={Duplicate}
            onClick={onCopy}
          >
            {formatMessage(messages.copyButton)}
          </Button>
          <Button
            variant={ButtonVariant.Primary}
            size={ButtonSize.Small}
            onClick={(): void => onOpenChange(false)}
          >
            {formatMessage(messages.closeButton)}
          </Button>
        </>
      }
    >
      <pre className={styles['log']}>
        {lines.map((line, index) => (
          <span
            // The log only grows, so a line never changes position.
            key={index}
            className={clsx(styles['line'], {
              [styles['line--error']]: line.kind === 'error',
            })}
          >
            {line.text}
          </span>
        ))}
      </pre>
    </AppLabDialog>
  );
};
