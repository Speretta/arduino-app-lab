import { defineMessages } from 'react-intl';

export const messages = defineMessages({
  label: {
    id: 'errorBanner.label',
    defaultMessage: 'Error:',
    description: 'Label shown before the error message in the error banner',
  },
  copyMessage: {
    id: 'errorBanner.copyMessage',
    defaultMessage: 'Copy error message',
    description:
      'Accessible label of the button that copies the full error message',
  },
});
