import {
  AgentPanelSlotProps,
  AppLabAppDetail,
  AppsSection,
} from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { lazy, memo, Suspense } from 'react';

import { useAppDetailLogic } from './appDetail.logic';

// Lazy so the agent bundle is fetched only once the panel is opened (same chunk the
// footer bar's Agent Mode route already uses via `@cloud-editor-mono/ai-assistant/panel`).
const AgentPanelContainer = lazy(() =>
  import('@cloud-editor-mono/ai-assistant/panel').then((module) => ({
    default: module.AgentPanelContainer,
  })),
);

const agentPanelSlot = (props: AgentPanelSlotProps): React.ReactNode => (
  <Suspense fallback={null}>
    <AgentPanelContainer {...props} />
  </Suspense>
);

interface AppDetailProps {
  appId: string;
  section: AppsSection;
  breadcrumbId?: string;
}

const AppDetailFeat: React.FC<AppDetailProps> = (props: AppDetailProps) => {
  const { appId, section, breadcrumbId } = props;

  return (
    <AppLabAppDetail
      appId={appId}
      section={section}
      breadcrumbId={breadcrumbId}
      appLabAppDetailLogic={useAppDetailLogic}
      agentPanelSlot={agentPanelSlot}
    />
  );
};

export default memo(AppDetailFeat);
