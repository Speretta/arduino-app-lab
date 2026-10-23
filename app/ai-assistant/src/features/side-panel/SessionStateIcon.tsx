import clsx from 'clsx';

import { SessionDotState } from '../../utils';
import styles from './session-state-icon.module.scss';

export interface SessionStateIconProps {
  state: SessionDotState;
}

export const SessionStateIcon = ({
  state,
}: SessionStateIconProps): JSX.Element => (
  <span className={styles['wrapper']}>
    {state === 'typing' ? (
      <span className={styles['typing']}>
        <span />
        <span />
        <span />
      </span>
    ) : (
      <span className={clsx(styles['dot'], styles[state])} />
    )}
  </span>
);
