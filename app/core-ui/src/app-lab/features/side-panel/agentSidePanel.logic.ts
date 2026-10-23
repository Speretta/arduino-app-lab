import type { AgentSidePanelProps } from '@cloud-editor-mono/ai-assistant/panel';
import { getInitials } from '@cloud-editor-mono/ui-components/lib/common/utils';
import { useLocation } from '@tanstack/react-router';
import { useContext, useMemo } from 'react';

import { UseBoards } from '../../hooks/useBoards';
import { AuthContext } from '../../providers/auth/authContext';

export const useAgentSidePanelProps = (
  boardsProps: ReturnType<UseBoards>,
): AgentSidePanelProps => {
  const { pathname } = useLocation();
  const { user } = useContext(AuthContext);

  const isVisible = pathname.split('/').length <= 2;
  const initials = useMemo(() => getInitials(user?.name), [user?.name]);

  return {
    visible: isVisible,
    board: boardsProps.selectedBoard,
    boards: boardsProps.boards,
    onSelectBoard: boardsProps.selectBoard,
    user: initials ? { initials } : undefined,
  };
};
