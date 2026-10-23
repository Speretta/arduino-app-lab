import { ReactNode } from 'react';

import { XXXSmall } from '../../../../../typography';
import styles from './render-monospace.module.scss';

export const renderMonospace = (chunks: ReactNode[]): ReactNode => (
  <XXXSmall monospace className={styles['monospace']}>
    {chunks}
  </XXXSmall>
);
