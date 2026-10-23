import { Padlock } from '@cloud-editor-mono/images/assets/icons';
import clsx from 'clsx';

import { useI18n } from '../../../i18n/useI18n';
import { XXSmall } from '../../../typography';
import styles from './app-release.module.scss';
import { appReleaseMessages as messages } from './messages';

interface ReleaseBadgeProps {
  label?: string;
  className?: string;
}

export const ReleaseBadge: React.FC<ReleaseBadgeProps> = ({
  label,
  className,
}: ReleaseBadgeProps) => {
  const { formatMessage } = useI18n();

  return (
    <span className={clsx(styles['badge'], className)}>
      <Padlock aria-hidden="true" />
      <XXSmall className={styles['badge-text']}>
        {label
          ? formatMessage(messages.releaseBadgeWithLabel, { label })
          : formatMessage(messages.releaseBadge)}
      </XXSmall>
    </span>
  );
};
