import { Checkmark } from '@cloud-editor-mono/images/assets/icons';
import { useTooltip } from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import clsx from 'clsx';
import { Fragment, useRef } from 'react';

import { usePickerDismiss } from '../../utils';
import styles from './picker.module.scss';

export { default as pickerStyles } from './picker.module.scss';

export interface PickerOptionContent {
  label: string;
  // A plain glyph (e.g. an app's emoji) or a pre-rendered element (e.g. a session-state dot) —
  // either way rendered as a real flex sibling of the label, 8px apart, rather than folded into
  // the label text itself.
  Icon?: string | React.ReactElement;
  // Shown as a hover tooltip on the option row — omit for rows that don't need one.
  description?: string;
  // Renders a thin divider right after this option.
  dividerAfter?: boolean;
}

export interface PickerProps<T extends { id: string }> {
  items: T[];
  isOpen: boolean;
  onSelect: (id: string) => void;
  // Only one Picker is ever open at a time, so each one owns its own outside-click/Escape
  // dismiss instead of relying on a caller-supplied ref.
  onClose: VoidFunction;
  isSelected: (item: T) => boolean;
  getOption: (item: T) => PickerOptionContent;
  // Trigger visuals differ per consumer (icon-only button, label + chevron, …) — the shared part
  // is the menu underneath it, not the button that opens it. Wires its own onClick/onToggle.
  renderTrigger: (isOpen: boolean) => React.ReactNode;
  emptyState?: React.ReactNode;
  // Header row above the options; also labels the listbox.
  title?: string;
  // Row height. 'small' is the design system's 28px row, used by the sessions history.
  rowSize?: 'small';
  // Which edge the menu is pinned to: one at the left edge has to open the other way, or it
  // extends past its host and gets clipped by its overflow.
  align?: 'left' | 'right';
  // Pickers docked near the top of their host open downward; ones docked near the bottom (the
  // chat composer) open upward so the menu doesn't run off the bottom edge.
  direction?: 'up' | 'down';
  classes?: { container?: string; menu?: string };
}

interface PickerOptionProps {
  content: PickerOptionContent;
  isSelected: boolean;
  onSelect: VoidFunction;
  small?: boolean;
}

const PickerOption: React.FC<PickerOptionProps> = ({
  content,
  isSelected,
  onSelect,
  small,
}: PickerOptionProps) => {
  const Icon = content.Icon;
  const { props: tooltipProps, renderTooltip } = useTooltip({
    content: content.description,
    timeout: 0,
    renderDelay: 500,
  });

  return (
    <div {...tooltipProps} className={styles['picker-option-wrapper']}>
      <button
        type="button"
        className={clsx(
          styles['picker-option'],
          small && styles['picker-option--small'],
        )}
        data-selected={isSelected}
        onClick={onSelect}
      >
        {Icon &&
          (typeof Icon === 'string' ? (
            <span className={styles['picker-option-glyph']} aria-hidden="true">
              {Icon}
            </span>
          ) : (
            Icon
          ))}
        <span className={styles['picker-option-label']}>{content.label}</span>
        {isSelected && (
          <Checkmark className={styles['picker-check']} aria-hidden="true" />
        )}
      </button>
      {content.description && renderTooltip(styles['picker-tooltip'])}
    </div>
  );
};

export function Picker<T extends { id: string }>({
  items,
  isOpen,
  onSelect,
  onClose,
  isSelected,
  getOption,
  renderTrigger,
  emptyState,
  title,
  rowSize,
  align = 'right',
  direction = 'down',
  classes,
}: PickerProps<T>): React.ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  usePickerDismiss(isOpen, rootRef, onClose);

  return (
    <div ref={rootRef} className={clsx(styles['picker'], classes?.container)}>
      {renderTrigger(isOpen)}
      {isOpen && (
        <ul
          className={clsx(
            styles['picker-menu'],
            direction === 'up' && styles['picker-menu--up'],
            align === 'left' && styles['picker-menu--left'],
            classes?.menu,
          )}
          role="listbox"
          aria-label={title}
        >
          {title && (
            <li role="presentation" className={styles['picker-title']}>
              {title}
            </li>
          )}
          {items.length === 0 && emptyState ? (
            <li className={styles['picker-empty']}>{emptyState}</li>
          ) : (
            items.map((item) => {
              const content = getOption(item);
              return (
                <Fragment key={item.id}>
                  <li role="option" aria-selected={isSelected(item)}>
                    <PickerOption
                      content={content}
                      isSelected={isSelected(item)}
                      onSelect={(): void => onSelect(item.id)}
                      small={rowSize === 'small'}
                    />
                  </li>
                  {content.dividerAfter && (
                    <li role="separator" className={styles['picker-divider']} />
                  )}
                </Fragment>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
