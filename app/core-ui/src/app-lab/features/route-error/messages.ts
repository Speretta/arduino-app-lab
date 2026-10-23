import { defineMessages } from 'react-intl';

export const routeErrorMessages = defineMessages({
  title: {
    id: 'routeError.title',
    defaultMessage: 'App Lab could not load this page.',
    description: 'Shown in place of a page that failed to load',
  },
  hint: {
    id: 'routeError.hint',
    defaultMessage:
      'Restart App Lab. If this keeps happening, contact Arduino support.',
    description: 'What to do when a page failed to load',
  },
});
