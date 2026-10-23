import { useTheme } from '@bcmi-labs/art-ui';
import { Button } from '@bcmi-labs/art-ui/components';
import { Config } from '@cloud-editor-mono/common';
import { isPlayStoreApp } from '@cloud-editor-mono/domain';
import {
  NotFoundPageImage,
  NotFoundPageImageDark,
} from '@cloud-editor-mono/images/assets/icons';
import {
  Large,
  Link,
  Small,
  useI18n,
  XSmall,
} from '@cloud-editor-mono/ui-components';

import { NotFoundType } from '../../../routing/routing.type';
import { messages } from './messages';
import styles from './not-found-content.module.scss';

interface NotFoundContentProps {
  type: NotFoundType;
}

const NotFoundContent: React.FC<NotFoundContentProps> = (
  props: NotFoundContentProps,
) => {
  const { type } = props;

  const { formatMessage } = useI18n();
  const { themeName } = useTheme();

  const getInTouchLink = (
    <Link
      href={Config.ARDUINO_CONTACT_US_URL}
      target="_blank"
      rel="noreferrer"
      flavour={styles.getInTouch}
    >
      {formatMessage(messages.getInTouchLink)}
    </Link>
  );

  const handleClickGoToSketches = (): void => {
    window.location.href = `${Config.CLOUD_HOME_URL}/sketches`;
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {themeName === 'light' ? (
          <NotFoundPageImage />
        ) : (
          <NotFoundPageImageDark />
        )}
        <Large bold className={styles.title}>
          {formatMessage(messages.helpTitle, { type })}
        </Large>
        <Small className={styles.message}>
          {formatMessage(messages.helpMessage, { type })}
        </Small>
        <Button className={styles.button} onClick={handleClickGoToSketches}>
          {formatMessage(messages.goToSketches)}
        </Button>
        <hr className={styles.divider} />
        {!isPlayStoreApp() ? (
          <XSmall className={styles.needHelp}>
            {formatMessage(messages.needHelpMessage, { getInTouchLink })}
          </XSmall>
        ) : null}
      </div>
    </div>
  );
};

export default NotFoundContent;
