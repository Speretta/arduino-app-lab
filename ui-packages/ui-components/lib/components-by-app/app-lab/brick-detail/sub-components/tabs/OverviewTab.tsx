import { AppReference } from '@cloud-editor-mono/infrastructure';

import { BrickUsages } from '../brick-usages/BrickUsages';
import { BrickMarkdown } from './shared/BrickMarkdown';

export interface OverviewTabProps {
  readme?: string | null;
  usages?: AppReference[];
  onOpenExternalLink?: (url: string) => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  readme,
  usages = [],
  onOpenExternalLink,
}: OverviewTabProps) => (
  <>
    <BrickMarkdown content={readme} onOpenExternalLink={onOpenExternalLink} />
    {usages.length > 0 && <BrickUsages usages={usages} />}
  </>
);
