import { defineMessages } from 'react-intl';

export const appTitleMessages = defineMessages({
  actionRename: {
    id: 'appTitle.actionRename',
    defaultMessage: 'Rename',
    description: 'Rename the app',
  },
  actionDuplicate: {
    id: 'appTitle.actionDuplicate',
    defaultMessage: 'Duplicate',
    description: 'Duplicate the app',
  },
  actionExport: {
    id: 'appTitle.actionExport',
    defaultMessage: 'Export App',
    description: 'Export the app',
  },
  actionPublish: {
    id: 'appTitle.actionPublish',
    defaultMessage: 'Publish on Project Hub',
    description: 'Publish the app on Project Hub',
  },
  actionDelete: {
    id: 'appTitle.actionDelete',
    defaultMessage: 'Delete',
    description: 'Delete the app',
  },
  appDefault: {
    id: 'appTitle.appDefault',
    defaultMessage: 'Default',
    description: 'Indicates that the app is the default one',
  },
  appNameInUse: {
    id: 'appTitle.appNameInUse',
    defaultMessage: 'Name already in use, please choose another one.',
    description:
      'Error message when trying to set an app name that is already used',
  },
  runAtStartup: {
    id: 'appTitle.runAtStartup',
    defaultMessage: 'Run at startup',
    description: 'Label for the run at startup action',
  },
  setAsDefault: {
    id: 'appTitle.setAsDefault',
    defaultMessage:
      'This App is set as the startup App. This means it will automatically run every time you plug your board into <bold>any power source</bold>',
    description: 'Label for the set as default app',
  },
  overrideAsDefault: {
    id: 'appTitle.overrideAsDefault',
    defaultMessage:
      'Only one App can be set to launch at startup. Enabling this feature for the current App will <bold>override the {appName} App</bold>.',
    description: 'Label for the override default app',
  },
});
