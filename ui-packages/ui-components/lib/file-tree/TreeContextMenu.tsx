import * as ContextMenu from '@radix-ui/react-context-menu';

import { useI18n } from '../i18n/useI18n';
import { ContextMenuGroups } from './ContextMenuGroups';
import styles from './file-tree.module.scss';
import { TreeNode } from './fileTree.type';
import { messages } from './messages';

// An optional item shows only when its handler is passed.
type TreeContextMenuProps = {
  onCreate: (type: TreeNode['type']) => () => void;
  onAddBrick: () => void;
  onCreateBrick?: () => void;
  onAddSketch?: () => void;
  onAddSketchLibrary?: () => void;
  onResourceImport: (params: { path?: string; isFolder?: boolean }) => void;
};

const TreeContextMenu: React.FC<TreeContextMenuProps> = ({
  onCreate,
  onAddBrick,
  onCreateBrick,
  onAddSketch,
  onAddSketchLibrary,
  onResourceImport,
}: TreeContextMenuProps) => {
  const { formatMessage } = useI18n();

  const item = (
    key: string,
    onSelect: () => void,
    label: string,
  ): JSX.Element => (
    <ContextMenu.Item
      key={key}
      className={styles['tree-row-context-menu-item']}
      onSelect={onSelect}
    >
      {label}
    </ContextMenu.Item>
  );

  return (
    <ContextMenu.Portal>
      <ContextMenu.Content className={styles['tree-row-context-menu']}>
        <ContextMenuGroups
          groups={[
            [
              item(
                'create-file',
                onCreate('file'),
                formatMessage(messages.createFile),
              ),
              item(
                'create-folder',
                onCreate('folder'),
                formatMessage(messages.createFolder),
              ),
            ],
            [
              item(
                'import-file',
                (): void => onResourceImport({}),
                formatMessage(messages.importFile),
              ),
              item(
                'import-folder',
                (): void => onResourceImport({ isFolder: true }),
                formatMessage(messages.importFolder),
              ),
            ],
            [
              !!onAddSketch &&
                item(
                  'add-sketch',
                  onAddSketch,
                  formatMessage(messages.addSketchFolder),
                ),
              !!onAddSketchLibrary &&
                item(
                  'add-sketch-library',
                  onAddSketchLibrary,
                  formatMessage(messages.addSketchLibrary),
                ),
            ],
            [
              item('add-brick', onAddBrick, formatMessage(messages.addBrick)),
              !!onCreateBrick &&
                item(
                  'create-brick',
                  onCreateBrick,
                  formatMessage(messages.createBrick),
                ),
            ],
          ]}
        />
      </ContextMenu.Content>
    </ContextMenu.Portal>
  );
};

export { TreeContextMenu };
