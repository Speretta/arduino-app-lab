import { defineMessages } from 'react-intl';

export const systemMessages = defineMessages({
  remoteAccessToggle: {
    id: 'appLabSettings.system.remoteAccessToggle',
    defaultMessage: 'Remote access (SSH) {enabled} successfully.',
    description: 'Snackbar message for remote access toggle',
  },
  remoteAccessToggleError: {
    id: 'appLabSettings.system.remoteAccessToggleError',
    defaultMessage:
      'Incorrect password. Remote access (SSH) could not be {enabled}.',
    description:
      'Snackbar error message for remote access toggle with incorrect password',
  },
});
