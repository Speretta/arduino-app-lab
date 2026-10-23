import {
  AppLabDialog,
  ButtonAppearance,
  ButtonVariant,
  TextSize,
} from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';

import { Button } from '../Button/Button';
import { Text } from '../Text/Text';
import styles from './confirm-dialog.module.scss';

interface ConfirmDialogProps {
  title: string;
  Icon: React.FC<React.SVGProps<SVGSVGElement>>;
  heading: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  // Destructive (red) confirm for irreversible actions vs the default accent.
  destructive?: boolean;
  // Icon colour, independent of the confirm button: a warning can carry a red icon over a plain confirm.
  iconTone?: 'accent' | 'error';
  loading?: boolean;
  onConfirm: VoidFunction;
  onClose: VoidFunction;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  Icon,
  heading,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  iconTone = destructive ? 'error' : 'accent',
  loading = false,
  onConfirm,
  onClose,
}) => (
  <AppLabDialog
    open
    onOpenChange={(next: boolean): void => {
      if (!next) {
        onClose();
      }
    }}
    title={title}
    classes={{
      body: styles['dialog-body'],
    }}
    footer={
      <>
        {cancelLabel !== undefined && (
          <Button variant={ButtonVariant.Secondary} onClick={onClose}>
            {cancelLabel}
          </Button>
        )}
        <Button
          variant={
            destructive ? ButtonVariant.Secondary : ButtonVariant.Primary
          }
          appearance={
            destructive ? ButtonAppearance.Destructive : ButtonAppearance.Action
          }
          loading={loading}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </>
    }
  >
    <div className={styles['body']}>
      <Icon
        className={
          iconTone === 'error'
            ? `${styles['icon']} ${styles['icon--error']}`
            : styles['icon']
        }
        aria-hidden="true"
      />
      <Text size={TextSize.Medium} bold className={styles['heading']}>
        {heading}
      </Text>
      <Text size={TextSize.Small} className={styles['description']}>
        {description}
      </Text>
    </div>
  </AppLabDialog>
);

export default ConfirmDialog;
