import {
  AppLabToggleOff,
  AppLabToggleOn,
} from '@cloud-editor-mono/images/assets/icons';
import clsx from 'clsx';
import { useRef } from 'react';
import { AriaToggleButtonProps, useToggleButton } from 'react-aria';
import { useToggleState } from 'react-stately';

import styles from './toggle.module.scss';

interface ToggleProps extends AriaToggleButtonProps<'button' | 'span'> {
  className?: string;
}

export const Toggle: React.FC<ToggleProps> = (props: ToggleProps) => {
  const { className, isDisabled, elementType = 'button' } = props;
  const ref = useRef<HTMLButtonElement & HTMLSpanElement>(null);
  const state = useToggleState(props);
  const { buttonProps } = useToggleButton(props, state, ref);
  // A menu item already renders a <button>, and a <button> inside it is invalid HTML.
  const Element = elementType;

  return (
    <Element
      {...buttonProps}
      className={clsx(
        styles['button'],
        {
          [styles['disabled']]: isDisabled,
          [styles['span']]: elementType === 'span',
        },
        className,
      )}
      ref={ref}
    >
      {state.isSelected ? <AppLabToggleOn /> : <AppLabToggleOff />}
    </Element>
  );
};

Toggle.displayName = 'Toggle';
