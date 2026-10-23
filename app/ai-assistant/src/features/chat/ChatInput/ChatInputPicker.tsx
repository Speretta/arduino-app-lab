import { ChevronDown } from '@cloud-editor-mono/images/assets/icons';
import { useTooltip } from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import clsx from 'clsx';

import { Picker, pickerStyles } from '../../../ui';
import styles from './chat-input.module.scss';

interface PickerItem {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  // Sets this item apart from the ones listed after it
  dividerAfter?: boolean;
}

interface ChatInputPickerProps {
  items: PickerItem[];
  selected: PickerItem;
  label: string;
  isOpen: boolean;
  // The model picker appends the resolved version to the name.
  getLabel?: (item: PickerItem) => string;
  // Which edge the menu is pinned to: one at the left edge has to open the other way, or it extends past the panel, whose overflow then clips it.
  align?: 'left' | 'right';
  // Which way the menu opens. Defaults to 'up': the trigger normally sits right above the composer, pinned to the
  // panel's bottom edge, so there is no room below it to open into.
  direction?: 'up' | 'down';
  onToggle: VoidFunction;
  onClose: VoidFunction;
  onSelect: (id: string) => void;
  classes?: { trigger?: string; value?: string; icon?: string };
}

export const ChatInputPicker: React.FC<ChatInputPickerProps> = ({
  items,
  selected,
  label,
  isOpen,
  getLabel = (item: PickerItem): string => item.name,
  align = 'right',
  direction = 'up',
  onToggle,
  onClose,
  onSelect,
  classes,
}: ChatInputPickerProps) => {
  const {
    props: tooltipProps,
    renderTooltip,
    setShowTooltip,
  } = useTooltip({
    content: selected.description,
    timeout: 0,
    renderDelay: 500,
  });

  return (
    <Picker
      items={items}
      isOpen={isOpen}
      isSelected={(item): boolean => item.id === selected.id}
      onSelect={onSelect}
      onClose={onClose}
      getOption={(
        item,
      ): {
        label: string;
        Icon?: string;
        description?: string;
        dividerAfter?: boolean;
      } => ({
        label: getLabel(item),
        Icon: item.icon,
        description: item.description,
        dividerAfter: item.dividerAfter,
      })}
      align={align}
      direction={direction}
      classes={{
        container: styles['chat-input-picker'],
        menu: styles['chat-input-picker-menu'],
      }}
      renderTrigger={(): React.ReactNode => (
        <div
          {...tooltipProps}
          className={styles['chat-input-picker-trigger-wrapper']}
        >
          <button
            type="button"
            className={clsx(
              styles['chat-input-picker-trigger'],
              pickerStyles['picker-trigger-border'],
              classes?.trigger,
            )}
            aria-label={label}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            onClick={(): void => {
              // Don't leave the hint hanging over the menu that's about to open.
              setShowTooltip(false);
              onToggle();
            }}
          >
            {selected.icon && (
              <span
                className={styles['chat-input-picker-trigger-glyph']}
                aria-hidden="true"
              >
                {selected.icon}
              </span>
            )}
            <span
              className={clsx(
                styles['chat-input-picker-value'],
                classes?.value,
              )}
            >
              {getLabel(selected)}
            </span>
            <ChevronDown
              className={clsx(styles['chat-input-picker-icon'], classes?.icon)}
              aria-hidden="true"
            />
          </button>
          {selected.description &&
            renderTooltip(styles['chat-input-picker-tooltip'])}
        </div>
      )}
    />
  );
};
