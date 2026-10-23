import {
  BrickDetailTabId,
  isBrickDetailTabId,
} from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { createFileRoute } from '@tanstack/react-router';

import BrickList from '../features/brick-list/BrickList.feat';

export type BricksSearch = {
  brickId?: string;
  tab?: BrickDetailTabId;
};

export const Route = createFileRoute('/bricks')({
  component: BrickList,
  validateSearch: (search: Record<string, unknown>): BricksSearch => ({
    brickId: typeof search.brickId === 'string' ? search.brickId : undefined,
    tab: isBrickDetailTabId(search.tab) ? search.tab : undefined,
  }),
});
