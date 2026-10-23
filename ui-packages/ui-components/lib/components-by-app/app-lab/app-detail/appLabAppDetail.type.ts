import { AppDetailedInfo } from '@cloud-editor-mono/infrastructure';
import {
  AiModelRequiredDialogLogic,
  AppAction,
  AppLabEditSectionLogic,
  AppTitleLogic,
  ConfigureAppBricksDialogLogic,
  DeleteTreeItemDialogLogic,
  RuntimeActionsLogic,
  SwapRunningAppDialogLogic,
  TreeNode,
} from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';

export type AppsSection = 'my-apps' | 'examples';

// The file in view in the editor beside the agent panel, read when a prompt is sent: the agent gets it, the user never sees it.
export interface AgentEditorContext {
  file?: {
    path: string; // the editor's file id: relative to the app; a board path or a file:// URI for a file outside it
    content: string; // what the editor shows, unsaved edits included
    unsaved: boolean;
  };
  selection?: {
    path: string;
    startLine: number;
    endLine: number;
    text: string;
  };
}

// What the agent side panel needs to render. The app passes a builder as a prop (see `agentPanelSlot`
// on AppLabAppDetail) so the agent bundle stays out of this package.
export interface AgentPanelSlotProps {
  appName: string;
  appId: string;
  onClose: VoidFunction;
  onSetupAgent: VoidFunction;
  getEditorContext?: () => AgentEditorContext;
}

export type AppLabAppDetailLogic = (
  appId: string,
  section: AppsSection,
) => {
  app?: AppDetailedInfo;
  fileTree?: TreeNode[];
  activePanel: 'editor' | 'console';
  configureAppBricksDialogLogic: ConfigureAppBricksDialogLogic;
  swapRunningAppDialogLogic: SwapRunningAppDialogLogic;
  aiModelRequiredDialogLogic: AiModelRequiredDialogLogic;
  onAppAction: (action: AppAction) => void;
  appTitleLogic: AppTitleLogic;
  appLabEditSectionLogic: AppLabEditSectionLogic;
  runtimeActionsLogic: RuntimeActionsLogic;
  updateOpenFile: (currFileId: string, nextFileId: string) => void;
  deleteTreeItemDialogLogic: DeleteTreeItemDialogLogic;
  agentPanelVisible: boolean;
  closeAgentPanel: VoidFunction;
  openAgentSettings: VoidFunction;
  getAgentEditorContext?: () => AgentEditorContext;
};
