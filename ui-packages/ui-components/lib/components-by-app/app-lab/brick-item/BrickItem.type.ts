import { AppBrickListItem } from '@cloud-editor-mono/infrastructure';

export interface BrickItemProps {
  brick: AppBrickListItem;
  selected?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onDelete?: () => void;
  onRename?: () => void;
  onAddBrick?: () => void;
  onDragStart?: (brick: AppBrickListItem) => void;
  onDragEnd?: () => void;
  missingConfig?: boolean;
}
