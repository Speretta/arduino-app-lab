import clsx from 'clsx';

import { useI18n } from '../../../i18n/useI18n';
import { XSmall, XXSmall } from '../../../typography';
import { MarkdownReader } from '../markdown-reader';
import styles from './app-release.module.scss';
import { appReleaseMessages as messages } from './messages';

// What the manifest of a release says, formatted for display.
export interface ReleaseDetails {
  name: string;
  icon?: string;
  createdAt?: string;
  label?: string;
  note?: string;
}

export interface ReleaseSummaryProps {
  release: ReleaseDetails;
  className?: string;
}

export const ReleaseSummary: React.FC<ReleaseSummaryProps> = ({
  release,
  className,
}: ReleaseSummaryProps) => {
  const { formatMessage } = useI18n();
  const { name, icon, createdAt, label, note } = release;

  return (
    <div className={clsx(styles['summary'], className)}>
      <div className={styles['row']}>
        <div className={styles['name']}>
          {icon ? (
            <span className={styles['icon']} aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <XSmall bold className={styles['title']}>
            {name}
          </XSmall>
        </div>
        {createdAt ? (
          <XXSmall className={styles['value']}>{createdAt}</XXSmall>
        ) : null}
      </div>
      {label ? (
        <div className={styles['row']}>
          <XXSmall semibold className={styles['label']}>
            {formatMessage(messages.labelLabel)}
          </XXSmall>
          <XXSmall className={styles['value']}>{label}</XXSmall>
        </div>
      ) : null}
      {note ? (
        <div className={styles['note']}>
          <XXSmall semibold className={styles['label']}>
            {formatMessage(messages.noteLabel)}
          </XXSmall>
          <div className={styles['note-box']}>
            <MarkdownReader
              content={note}
              classes={{ reader: styles['note-reader'] }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
};

ReleaseSummary.displayName = 'ReleaseSummary';
