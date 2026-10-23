import { BrickListItem } from '@cloud-editor-mono/infrastructure';
import {
  BrickDetailLogic,
  BrickDetailTabId,
} from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';

export interface UseBrickListLogicParams {
  brickId?: string;
  tab?: BrickDetailTabId;
}

export interface UseBrickListLogic {
  bricks: BrickListItem[];
  isPending: boolean;
  selectedBrick: BrickListItem | null;
  brickDetailLogic: BrickDetailLogic;
  setSelectedBrick: (brick: BrickListItem | null) => void;
  selectedTab?: BrickDetailTabId;
  setSelectedTab: (tab: BrickDetailTabId) => void;
}
