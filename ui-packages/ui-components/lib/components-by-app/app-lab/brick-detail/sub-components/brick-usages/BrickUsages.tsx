import { UsedByAppLink as UsedByAppLinkIcon } from '@cloud-editor-mono/images/assets/icons';
import { AppReference } from '@cloud-editor-mono/infrastructure';
import { useNavigate } from '@tanstack/react-router';

import { useI18n } from '../../../../../i18n/useI18n';
import { XSmall } from '../../../../../typography';
import { getBackgroundIcon } from '../../../../../utils';
import { EmojiPreview } from '../../../emoji-picker/sub-components/EmojiPreview';
import { messages } from '../../messages';
import styles from './brick-usages.module.scss';

const DEFAULT_ICON = '⚪'; // Default icon if none is provided

const getUsedByAppPath = (appId: string): string => {
  const decodedAppId = window.atob(appId);
  const section = decodedAppId.startsWith('examples:') ? 'examples' : 'my-apps';

  return `/${section}/${appId}`;
};

export interface BrickUsagesProps {
  usages: AppReference[];
}

export const BrickUsages: React.FC<BrickUsagesProps> = ({
  usages,
}: BrickUsagesProps) => {
  const { formatMessage } = useI18n();
  const navigate = useNavigate();

  return (
    <div className={styles['brick-usages']}>
      <XSmall className={styles['brick-usages-title']}>
        {formatMessage(messages.usedInTitle)}
      </XSmall>
      <div className={styles['brick-usages-cards']}>
        {usages.map((usage) => (
          <button
            key={usage.id}
            type="button"
            className={styles['brick-usage-card']}
            onClick={async (): Promise<void> => {
              if (usage.id) {
                await navigate({ to: getUsedByAppPath(usage.id) });
              }
            }}
          >
            <div className={styles['brick-usage-header']}>
              <div
                className={styles['brick-usage-header-bg']}
                style={{
                  backgroundImage: getBackgroundIcon(
                    usage.icon || DEFAULT_ICON,
                  ),
                }}
              ></div>
              <span className={styles['brick-usage-header-icon']}>
                <EmojiPreview size={16} value={usage.icon || DEFAULT_ICON} />
              </span>
            </div>
            <div className={styles['brick-usage-content']}>{usage.name}</div>
            <UsedByAppLinkIcon className={styles['brick-usage-link-icon']} />
          </button>
        ))}
      </div>
    </div>
  );
};
