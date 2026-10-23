import * as ContextMenu from '@radix-ui/react-context-menu';
import clsx from 'clsx';

import { useI18n } from '../i18n/useI18n';
import { XXSmall } from '../typography';
import { ContextMenuGroups } from './ContextMenuGroups';
import styles from './file-tree.module.scss';
import { TreeNode } from './fileTree.type';
import { messages } from './messages';
import { canBeDeleted, canBeRenamed, isFolderNode } from './utils';

type FileContextMenuProps = {
  node: TreeNode;
  onRename: () => void;
  onCreate: (type: TreeNode['type'], path: string) => () => void;
  onDelete: () => void;
  onResourceImport: (params: { path?: string; isFolder?: boolean }) => void;
};

const FileContextMenu: React.FC<FileContextMenuProps> = ({
  node,
  onRename,
  onCreate,
  onDelete,
  onResourceImport,
}: FileContextMenuProps) => {
  const { formatMessage } = useI18n();

  return (
    <ContextMenu.Portal>
      <ContextMenu.Content
        className={styles['tree-row-context-menu']}
        onContextMenu={(e): void => e.stopPropagation()}
      >
        <ContextMenuGroups
          groups={[
            [
              isFolderNode(node) && (
                <ContextMenu.Item
                  key="create-file"
                  className={styles['tree-row-context-menu-item']}
                  onSelect={onCreate('file', node.path)}
                >
                  {formatMessage(messages.createFile)}
                </ContextMenu.Item>
              ),
              isFolderNode(node) && (
                <ContextMenu.Item
                  key="create-folder"
                  className={styles['tree-row-context-menu-item']}
                  onSelect={onCreate('folder', node.path)}
                >
                  {formatMessage(messages.createFolder)}
                </ContextMenu.Item>
              ),
            ],
            [
              isFolderNode(node) && (
                <ContextMenu.Item
                  key="import-file"
                  className={styles['tree-row-context-menu-item']}
                  onSelect={(): void => onResourceImport({ path: node.path })}
                >
                  {formatMessage(messages.importFile)}
                </ContextMenu.Item>
              ),
              isFolderNode(node) && (
                <ContextMenu.Item
                  key="import-folder"
                  className={styles['tree-row-context-menu-item']}
                  onSelect={(): void =>
                    onResourceImport({ path: node.path, isFolder: true })
                  }
                >
                  {formatMessage(messages.importFolder)}
                </ContextMenu.Item>
              ),
            ],
            [
              canBeRenamed(node) && (
                <ContextMenu.Item
                  key="rename"
                  className={styles['tree-row-context-menu-item']}
                  onSelect={onRename}
                >
                  <XXSmall>{formatMessage(messages.rename)}</XXSmall>
                </ContextMenu.Item>
              ),
              canBeDeleted(node) && (
                <ContextMenu.Item
                  key="delete"
                  className={clsx(
                    styles['tree-row-context-menu-item'],
                    styles['danger'],
                  )}
                  onSelect={onDelete}
                >
                  <XXSmall>{formatMessage(messages.delete)}</XXSmall>
                </ContextMenu.Item>
              ),
            ],
          ]}
        />
      </ContextMenu.Content>
    </ContextMenu.Portal>
  );
};

export { FileContextMenu };
