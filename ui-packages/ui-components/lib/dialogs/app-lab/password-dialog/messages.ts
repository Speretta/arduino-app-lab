import { defineMessages } from 'react-intl';

export const messages = defineMessages({
  title: {
    id: 'appLab.passwordDialog.title',
    defaultMessage: 'Password required',
    description: 'Title for the password dialog',
  },
  save: {
    id: 'appLab.passwordDialog.save',
    defaultMessage: 'Confirm',
    description: 'Label for the save button in the password dialog',
  },
  subtitle: {
    id: 'appLab.passwordDialog.subtitle',
    defaultMessage: 'Linux password',
    description: 'Subtitle for the password dialog',
  },
  description: {
    id: 'appLab.passwordDialog.description',
    defaultMessage: 'Type your password to apply these changes',
    description: 'Description for the password dialog',
  },
  password: {
    id: 'appLab.passwordDialog.password',
    defaultMessage: 'Password',
    description: 'Label for the password input',
  },
  passwordWrong: {
    id: 'appLab.passwordDialog.passwordWrong',
    defaultMessage: 'Wrong password',
    description: 'Error message when password does not match',
  },
  genericError: {
    id: 'appLab.passwordDialog.genericError',
    defaultMessage: 'Something went wrong. Please try again.',
    description: 'Generic error message when applying changes',
  },
});
