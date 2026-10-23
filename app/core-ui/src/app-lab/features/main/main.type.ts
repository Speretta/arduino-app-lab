import type { AgentSidePanelProps } from '@cloud-editor-mono/ai-assistant/panel';
import {
  AppLabWelcomeDialogLogic,
  BoardUpdateDialogLogic,
  CreateAppDialogLogic,
  CreateReleaseDialogLogic,
  CreateReleaseIntroDialogLogic,
  FlashBoardDialogLogic,
  ImportResourceLogic,
  NetworkSettingsDialogLogic,
  OfflineWarningDialogLogic,
  PreparationRequiredDialogLogic,
  SidePanelLogic,
} from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';

import { UseBoards } from '../../hooks/useBoards';

export type UseMainLogic = () => {
  sidePanelLogic: SidePanelLogic;
  // AgentSidePanel takes plain data props and resolves its own behaviour through
  // its own hook, so nothing is injected into its render flow — these are props,
  // not a logic contract.
  agentSidePanelProps: AgentSidePanelProps;
  createAppDialogLogic: CreateAppDialogLogic;
  createReleaseIntroDialogLogic: CreateReleaseIntroDialogLogic;
  createReleaseDialogLogic: CreateReleaseDialogLogic;
  preparationRequiredDialogLogic: PreparationRequiredDialogLogic;
  importAppDialogLogic: ImportResourceLogic;
  boardUpdateDialogLogic: BoardUpdateDialogLogic;
  flashBoardDialogLogic: FlashBoardDialogLogic;
  appLabWelcomeDialogLogic: AppLabWelcomeDialogLogic;
  offlineWarningDialogLogic: OfflineWarningDialogLogic;
  networkSettingsDialogLogic: NetworkSettingsDialogLogic;
  boardsProps: ReturnType<UseBoards>;
  boardIsFlashing: boolean | undefined;
  showRoutes: boolean;
};
