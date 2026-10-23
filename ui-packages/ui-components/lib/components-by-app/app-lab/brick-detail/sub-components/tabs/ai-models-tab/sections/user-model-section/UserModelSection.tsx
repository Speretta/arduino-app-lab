import { Link as LinkIcon } from '@cloud-editor-mono/images/assets/icons';

import {
  AddHuggingFaceModelDialog,
  AddHuggingFaceModelDialogProps,
} from '../../../../../../../../dialogs/app-lab/add-hugging-face-model-dialog/AddHuggingFaceModelDialog';
import { useI18n } from '../../../../../../../../i18n/useI18n';
import { XXSmall } from '../../../../../../../../typography';
import {
  Button,
  ButtonAppearance,
  ButtonSize,
  ButtonVariant,
} from '../../../../../../essential/button';
import { messages } from '../../../../../messages';
import styles from './user-model-section.module.scss';

export interface UserModelSectionProps {
  addHuggingFaceModelDialogProps?: AddHuggingFaceModelDialogProps;
  hideAction?: boolean;
  children?: React.ReactNode;
}

export const UserModelSection: React.FC<UserModelSectionProps> = ({
  addHuggingFaceModelDialogProps,
  hideAction = false,
  children,
}: UserModelSectionProps) => {
  const { formatMessage } = useI18n();

  return (
    <>
      <div className={styles['section']}>
        <div className={styles['header']}>
          <XXSmall bold className={styles['title']}>
            {formatMessage(messages.userModelSectionTitle)}
          </XXSmall>
          {!hideAction && (
            <Button
              variant={ButtonVariant.Secondary}
              appearance={ButtonAppearance.LowContrast}
              size={ButtonSize.XSmall}
              onClick={(): void =>
                addHuggingFaceModelDialogProps?.onOpenChange(true)
              }
              Icon={LinkIcon}
              classes={{
                button: styles['button'],
              }}
            >
              {formatMessage(messages.linkHuggingFaceButton)}
            </Button>
          )}
        </div>
        {children}
      </div>
      {!hideAction && addHuggingFaceModelDialogProps && (
        <AddHuggingFaceModelDialog {...addHuggingFaceModelDialogProps} />
      )}
    </>
  );
};
