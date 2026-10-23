import { defineMessages } from 'react-intl';

export const messages = defineMessages({
  notConnected: {
    id: 'appLabFooterBar.boardSelection.notConnected',
    defaultMessage: 'Board not connected',
    description: 'Label shown when no board is connected',
  },
  switchBoardDropdownButton: {
    id: 'appLabFooterBar.boardSelection.switchBoardDropdownButton',
    defaultMessage: 'Switch board',
    description: 'Title for the dropdown button used to switch boards',
  },
  switchBoardDropdownMenuItemNoBoards: {
    id: 'appLabFooterBar.boardSelection.switchBoardDropdownMenuItemNoBoards',
    defaultMessage: 'No boards available',
    description: 'Label shown when no boards are available for selection',
  },
});
