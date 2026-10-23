import * as ContextMenu from '@radix-ui/react-context-menu';

import { useI18n } from '../../../../i18n/useI18n';
import styles from '../app-lab-edit-section.module.scss';
import { messages } from '../messages';

type FilesManagerContextMenuProps = {
  onAddBrick?: () => void;
  onAddSketchLibrary?: () => void;
};

const FilesManagerContextMenu: React.FC<FilesManagerContextMenuProps> = ({
  onAddBrick,
  onAddSketchLibrary,
}: FilesManagerContextMenuProps) => {
  const { formatMessage } = useI18n();

  return (
    <ContextMenu.Portal>
      <ContextMenu.Content className={styles['files-manager-context-menu']}>
        {onAddBrick && (
          <ContextMenu.Item
            className={styles['files-manager-context-menu-item']}
            onSelect={onAddBrick}
          >
            {formatMessage(messages.addBrickButton)}
          </ContextMenu.Item>
        )}
        {onAddSketchLibrary && (
          <ContextMenu.Item
            className={styles['files-manager-context-menu-item']}
            onSelect={onAddSketchLibrary}
          >
            {formatMessage(messages.addSketchLibraryButton)}
          </ContextMenu.Item>
        )}
      </ContextMenu.Content>
    </ContextMenu.Portal>
  );
};

export { FilesManagerContextMenu };
