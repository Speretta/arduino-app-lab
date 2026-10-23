import { AriaPopoverProps, Overlay, usePopover } from '@react-aria/overlays';
import clsx from 'clsx';
import { useLayoutEffect, useRef, useState } from 'react';
import { useInteractOutside } from 'react-aria';
import { MenuTriggerState } from 'react-stately';
import { useWindowSize } from 'react-use';

import styles from './dropdown-menu.module.scss';

// react-aria's default `containerPadding`: the gap it keeps from the window edge.
const VIEWPORT_PADDING = 12;

interface DropdownMenuPopoverProps
  extends Omit<AriaPopoverProps, 'popoverRef'> {
  children: React.ReactNode;
  state: MenuTriggerState;
  classes?: { dropdownMenuPopover?: string };
  useStaticPosition?: boolean;
  /**
   * Render the popover in a portal attached to the document body. Needed when
   * an ancestor clips (`overflow`) or caps (`z-index`) the popover, e.g. inside
   * a resizable panel. Requires `useStaticPosition={false}` to be positioned.
   */
  usePortal?: boolean;
  placement?: AriaPopoverProps['placement'];
}

const DropdownMenuPopover: React.FC<DropdownMenuPopoverProps> = (
  props: DropdownMenuPopoverProps,
) => {
  const {
    children,
    state,
    classes,
    useStaticPosition = true,
    usePortal = false,
    placement,
  } = props;

  const ref = useRef<HTMLDivElement>(null);
  const [alignRight, setAlignRight] = useState(false);
  const { width: windowWidth } = useWindowSize();

  const { popoverProps } = usePopover(
    {
      ...props,
      popoverRef: ref,
      isNonModal: true,
      ...(!useStaticPosition && {
        offset: 8,
        placement: placement ?? (alignRight ? 'bottom right' : 'bottom left'),
      }),
    },
    state,
  );

  // react-aria only shifts an overflowing popover, which detaches it from the
  // trigger's corner. Align the right edges instead when the menu does not fit
  // on the right. This runs after usePopover's own layout effect, so the
  // placement change is applied before paint.
  useLayoutEffect(() => {
    const trigger = props.triggerRef.current;
    if (useStaticPosition || placement || !trigger || !ref.current) return;

    const { left, right } = trigger.getBoundingClientRect();
    const menuWidth = ref.current.offsetWidth;
    const viewportWidth = document.documentElement.clientWidth;
    setAlignRight(
      left + menuWidth > viewportWidth - VIEWPORT_PADDING &&
        right - menuWidth >= VIEWPORT_PADDING,
    );
  }, [useStaticPosition, placement, props.triggerRef, windowWidth]);

  useInteractOutside({
    ref,
    onInteractOutside: () => {
      state.close();
    },
  });

  const popover = (
    <div
      {...popoverProps}
      style={popoverProps.style}
      ref={ref}
      className={clsx(
        useStaticPosition && styles['dropdown-menu-popover-static'],
        usePortal && styles['dropdown-menu-popover-portal'],
        classes?.dropdownMenuPopover,
      )}
    >
      {children}
    </div>
  );

  return usePortal ? <Overlay>{popover}</Overlay> : popover;
};

export default DropdownMenuPopover;
