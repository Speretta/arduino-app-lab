import { defineMessages } from 'react-intl';

export const defaultAppMessages = defineMessages({
  setAsDefault: {
    id: 'app-lab.default-app.set-as-default',
    defaultMessage: '{appName} is now your default App',
    description: 'Success message when an app is set as the default App',
  },
  undo: {
    id: 'app-lab.default-app.undo',
    defaultMessage: 'Undo',
    description: 'Snackbar action that removes the App just set as default',
  },
  undoFailed: {
    id: 'app-lab.default-app.undo-failed',
    defaultMessage: 'Failed to remove {appName} as default App',
    description: 'Error message when undoing the default App fails',
  },
});
