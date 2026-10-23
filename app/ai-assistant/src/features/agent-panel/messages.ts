import { defineMessages } from 'react-intl';

export const messages = defineMessages({
  noAgentTitle: {
    id: 'aiAssistant.agentPanel.noAgentTitle',
    defaultMessage: 'AI Assistant',
    description:
      'Agent side panel header title shown when no agent is connected',
  },
  newSessionTitle: {
    id: 'aiAssistant.agentPanel.newSessionTitle',
    defaultMessage: 'New session',
    description:
      'Agent side panel header title shown once connected, before a session has its own title',
  },
  newChatButton: {
    id: 'aiAssistant.agentPanel.newChat',
    defaultMessage: 'New chat',
    description: 'Header button starting a fresh session',
  },
  historyButton: {
    id: 'aiAssistant.agentPanel.history',
    defaultMessage: 'Show sessions history',
    description: "Header button opening this app's past sessions",
  },
  historyTitle: {
    id: 'aiAssistant.agentPanel.historyTitle',
    defaultMessage: 'Sessions history',
    description: 'Header above the session rows in the history menu',
  },
  historyEmpty: {
    id: 'aiAssistant.agentPanel.historyEmpty',
    defaultMessage: 'No chats on this app yet',
    description: 'Shown in the history menu when the app has no past sessions',
  },
  historyUntitled: {
    id: 'aiAssistant.agentPanel.historyUntitled',
    defaultMessage: 'Untitled chat',
    description: 'History row for a session the agent has not named yet',
  },
  closeButton: {
    id: 'aiAssistant.agentPanel.close',
    defaultMessage: 'Close',
    description: 'Header button closing the agent side panel',
  },
  noAgentText: {
    id: 'aiAssistant.agentPanel.noAgentText',
    defaultMessage: 'Install an agent to build and edit with it.',
    description: 'Empty-state copy shown when no agent is connected',
  },
  setupAgentButton: {
    id: 'aiAssistant.agentPanel.setupAgent',
    defaultMessage: 'Set up an agent',
    description: 'Empty-state CTA navigating to agent settings',
  },
});
