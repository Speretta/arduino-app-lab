import { defineMessages } from 'react-intl';

export const messages = defineMessages({
  removeBrickLabel: {
    id: 'brickItem.removeBrickLabel',
    defaultMessage: 'Remove',
    description:
      'Label for the context menu item to remove a brick from the app',
  },
  renameBrickLabel: {
    id: 'brickItem.renameBrickLabel',
    defaultMessage: 'Rename',
    description: 'Label for the context menu item to rename a brick',
  },
  missingConfigTooltip: {
    id: 'brickItem.missingConfigTooltip',
    defaultMessage: 'Missing configuration files',
    description:
      'Tooltip message shown when a brick is missing its configuration (e.g. not found in the project)',
  },
});
