import { defineMessages } from 'react-intl';

export const mainMessages = defineMessages({
  storageUnavailable: {
    id: 'main.storageUnavailable',
    defaultMessage:
      'App Lab cannot use its saved state. Your last board, last app and open tabs may not be restored, and changes to them may not be kept.',
    description:
      'Warning shown when App Lab cannot open or write its local storage',
  },
});
