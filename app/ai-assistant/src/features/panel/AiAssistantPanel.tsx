import {
  ArduinoLoader,
  TextSize,
  useI18n,
} from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { useEffect } from 'react';
import type { MessageDescriptor } from 'react-intl';

import { messages } from '../../messages';
import type { AgentWorkspace } from '../../services';
import type { AgentDownReason } from '../../store';
import { useChatStore } from '../../store';
import { Button, Text } from '../../ui';
import { ChatPanel } from '../chat/ChatPanel/ChatPanel';
import { ConnectPanel } from '../connect/ConnectPanel';
import styles from './ai-assistant-panel.module.scss';
import { useAiAssistantPanelLogic } from './AiAssistantPanel.logic';

// A deliberate teardown reads nothing like a crash, and a reflash reads nothing like a board swap, so the
// stopped prompt says which one happened.
const stoppedCopy = (
  reason?: AgentDownReason,
): { title: MessageDescriptor; body: MessageDescriptor } => {
  switch (reason) {
    case 'board-changed':
      return {
        title: messages.agentBoardChangedTitle,
        body: messages.agentBoardChangedBody,
      };
    case 'board-flashed':
      return {
        title: messages.agentBoardFlashedTitle,
        body: messages.agentBoardFlashedBody,
      };
    default:
      return {
        title: messages.agentStoppedTitle,
        body: messages.agentStoppedBody,
      };
  }
};

// Entry point: restore an existing login on open (skip connect), otherwise the connect state, then the chat.
export interface AiAssistantPanelProps {
  // Provided by the host, which owns the board's app list; empty/absent hides the picker.
  workspaces?: AgentWorkspace[];
  // Whether Agent Mode is the surface on screen: App Lab keeps this panel mounted and hides it otherwise.
  active?: boolean;
}

export const AiAssistantPanel: React.FC<AiAssistantPanelProps> = ({
  workspaces,
  active = true,
}: AiAssistantPanelProps) => {
  const { formatMessage } = useI18n();
  const {
    loading,
    authenticated,
    agentDown,
    agentDownReason,
    reconnecting,
    reconnect,
    reviving,
  } = useAiAssistantPanelLogic();
  const setAgentModeActive = useChatStore((s) => s.setAgentModeActive);

  // The editor's docked panel reads this to know it is the one hidden.
  useEffect(() => {
    setAgentModeActive(active);
  }, [active, setAgentModeActive]);

  // The confirmed-switch teardown revives itself, so it gets the loader rather than the stopped prompt.
  if (loading || reviving) {
    return (
      <div className={styles['loading']}>
        <ArduinoLoader className={styles['loader']} />
        <Text size={TextSize.XXSmall} className={styles['caption']}>
          {formatMessage(
            reviving ? messages.switchBoardReviving : messages.resuming,
          )}
        </Text>
      </div>
    );
  }

  if (agentDown) {
    const stopped = stoppedCopy(agentDownReason);
    return (
      <div className={styles['stopped']}>
        <Text className={styles['stopped-title']}>
          {formatMessage(stopped.title)}
        </Text>
        <Text size={TextSize.XXSmall} className={styles['stopped-body']}>
          {formatMessage(stopped.body)}
        </Text>
        <Button
          loading={reconnecting}
          disabled={reconnecting}
          onClick={reconnect}
        >
          {formatMessage(messages.agentReconnect)}
        </Button>
      </div>
    );
  }

  return authenticated ? (
    <ChatPanel workspaces={workspaces} onScreen={active} />
  ) : (
    <ConnectPanel />
  );
};

export default AiAssistantPanel;
