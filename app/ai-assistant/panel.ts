// Lazy entry: the panel UI, code-split via React.lazy (separate from the eager service root).
// `AgentWorkspace` is deliberately not here: the host builds the list without mounting the panel,
// so it lives in the eager root alongside the rest of the service contract.
export type {
  AgentPanelContainerProps,
  AgentSidePanelProps,
  AiAssistantPanelProps,
} from './src/features';
export {
  AgentPanelContainer,
  AgentSettings,
  AgentSidePanel,
  AiAssistantPanel,
  SwitchBoardDialog,
} from './src/features';
