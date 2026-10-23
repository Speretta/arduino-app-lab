import { ErrorComponentProps } from '@tanstack/react-router';
import { useEffect } from 'react';
import { FormattedMessage } from 'react-intl';

import { I18nProvider } from '../../../common/providers/i18n/I18nContextProvider';
import { routeErrorMessages as messages } from './messages';
import styles from './routeError.module.scss';

// The error message is logged, never shown: it can be a raw engine string such
// as WebKit's IndexedDB errors. The component has its own I18nProvider because
// an error in the root route renders outside AppLabProvider.
const RouteError: React.FC<ErrorComponentProps> = ({
  error,
}: ErrorComponentProps) => {
  useEffect(() => {
    console.error('App Lab: a route failed to load', error);
  }, [error]);

  return (
    <I18nProvider>
      <div className={styles['route-error']} role="alert">
        <p className={styles['title']}>
          <FormattedMessage {...messages.title} />
        </p>
        <p className={styles['hint']}>
          <FormattedMessage {...messages.hint} />
        </p>
      </div>
    </I18nProvider>
  );
};

export default RouteError;
