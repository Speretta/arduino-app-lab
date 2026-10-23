import { CaretDown, Checkmark } from '@cloud-editor-mono/images/assets/icons';
import type { Key } from '@react-types/shared';
import clsx from 'clsx';
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { MessageDescriptor } from 'react-intl';

import { DropdownMenuButton } from '../../../../essential/dropdown-menu';
import { DropdownMenuButtonProps } from '../../../../essential/dropdown-menu/DropdownMenuButton';
import { Input, InputStyle } from '../../../../essential/input';
import styles from './select.module.scss';

type SelectProps<T, L extends MessageDescriptor | string> = Pick<
  DropdownMenuButtonProps<T, L>,
  'sections'
> & {
  id?: string;
  name?: string;
  value: string;
  // Marks this item with a checkmark in the open menu.
  selectedKey?: Key;
  label?: string;
  disabled?: boolean;
  onChange: NonNullable<DropdownMenuButtonProps<T, L>['onAction']>;
  onEnter?: () => void;

  classes?: {
    container?: string;
    disabled?: string;
    open?: string;
    input?: string;
    inputLabel?: string;
    dropdownMenu?: string;
    dropdownMenuButton?: string;
    dropdownMenuButtonWrapper?: string;
    dropdownMenuIcon?: string;
  };
};

export const Select = forwardRef(
  <T, L extends MessageDescriptor | string>(
    props: SelectProps<T, L>,
    ref: React.ForwardedRef<HTMLDivElement | null>,
  ) => {
    const [open, setOpen] = useState(false);
    const inputRef = useRef<HTMLDivElement | null>(null);

    useImperativeHandle(ref, () => inputRef.current!);

    useEffect(() => {
      if (!open) return;
      function handleClickOutside(event: MouseEvent): void {
        if (
          inputRef.current &&
          !inputRef.current.contains(event.target as Node)
        ) {
          setOpen(false);
        }
      }

      function handleInputWidth(): void {
        const dropdownMenu = document.querySelector(
          `.${styles['dropdown-menu']}`,
        ) as HTMLElement | null;
        if (dropdownMenu && inputRef.current) {
          const inputWidth = inputRef.current.offsetWidth;
          dropdownMenu.style.width = `${inputWidth}px`;
        }
      }
      handleInputWidth();

      document.addEventListener('click', handleClickOutside);
      return (): void => {
        document.removeEventListener('click', handleClickOutside);
      };
    }, [open]);

    const {
      id,
      name,
      value,
      label,
      disabled,
      onChange,
      onEnter,
      sections,
      selectedKey,
      classes,
    } = props;

    const menuSections =
      selectedKey === undefined
        ? sections
        : sections.map((section) => ({
            ...section,
            items: section.items.map((item) =>
              item.id === selectedKey
                ? {
                    ...item,
                    labelSuffix: (
                      <Checkmark
                        aria-hidden="true"
                        className={styles['selected-check']}
                      />
                    ),
                  }
                : item,
            ),
          }));

    return (
      <div
        ref={inputRef}
        role="button"
        tabIndex={0}
        className={clsx(styles['container'], classes?.container, {
          [styles['disabled']]: disabled,
          [styles['open']]: open,
          [classes?.disabled || '']: disabled,
          [classes?.open || '']: open,
        })}
        onClick={(): void => setOpen((prev) => !prev)}
        onKeyUp={(): void => setOpen((prev) => !prev)}
      >
        <Input
          inputStyle={InputStyle.AppLab}
          id={id}
          type="text"
          readOnly
          name={name}
          value={value}
          onClick={(): void => setOpen((prev) => !prev)}
          onChange={onChange}
          onEnter={onEnter}
          label={label}
          classes={{
            input: clsx(styles['input'], classes?.input),
            inputLabel: clsx(styles['input-label'], classes?.inputLabel),
          }}
        />
        {!disabled && (
          <DropdownMenuButton
            isOpen={open}
            sections={menuSections}
            classes={{
              dropdownMenu: clsx(
                styles['dropdown-menu'],
                classes?.dropdownMenu,
              ),
              dropdownMenuButton: clsx(
                styles['dropdown-menu-button'],
                classes?.dropdownMenuButton,
              ),
              dropdownMenuButtonWrapper: clsx(
                styles['dropdown-menu-button-wrapper'],
                classes?.dropdownMenuButtonWrapper,
              ),
              dropdownMenuPopover: styles['dropdown-menu-popover'],
              dropdownMenuItem:
                selectedKey !== undefined
                  ? styles['dropdown-menu-item']
                  : undefined,
            }}
            useStaticPosition={false}
            onAction={(key): void => {
              setOpen(false);
              onChange(key);
            }}
            buttonChildren={
              <CaretDown
                className={clsx(
                  styles['dropdown-menu-icon'],
                  classes?.dropdownMenuIcon,
                  {
                    [styles['dropdown-menu-icon--open']]: open,
                  },
                )}
                onClick={(): void => setOpen((prev) => !prev)}
              />
            }
          />
        )}
      </div>
    );
  },
);

Select.displayName = 'Select';
