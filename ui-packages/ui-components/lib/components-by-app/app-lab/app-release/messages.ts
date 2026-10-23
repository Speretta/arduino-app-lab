import { defineMessages } from 'react-intl';

export const appReleaseMessages = defineMessages({
  actionCreateRelease: {
    id: 'appRelease.actionCreateRelease',
    defaultMessage: 'Create release',
    description: 'Menu action that creates a release of the App',
  },
  actionReleaseInfo: {
    id: 'appRelease.actionReleaseInfo',
    defaultMessage: 'Release info',
    description: 'Menu action that shows what an installed release is',
  },
  labelLabel: {
    id: 'releaseForm.labelLabel',
    defaultMessage: 'Release label',
    description: 'Label of the release label, in the form and in the summary',
  },
  noteLabel: {
    id: 'releaseForm.noteLabel',
    defaultMessage: 'Release note',
    description: 'Label of the release note, in the form and in the summary',
  },
  releaseBadge: {
    id: 'appRelease.releaseBadge',
    defaultMessage: 'Release',
    description: 'Badge on an App installed from a release',
  },
  releaseBadgeWithLabel: {
    id: 'appRelease.releaseBadgeWithLabel',
    defaultMessage: 'Release · {label}',
    description: 'Badge on an App installed from a release that has a label',
  },
});
