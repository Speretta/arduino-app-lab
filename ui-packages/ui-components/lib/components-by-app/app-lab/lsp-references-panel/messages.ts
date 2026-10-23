import { defineMessages } from 'react-intl';

export const messages = defineMessages({
  panelTitle: {
    id: 'appLabReferencesPanel.panelTitle',
    defaultMessage: 'References found:',
    description: 'Header of the panel listing every reference to a symbol',
  },
  close: {
    id: 'appLabReferencesPanel.close',
    defaultMessage: 'Close references panel',
    description: 'Label for the button that closes the references panel',
  },
  referencesToSymbol: {
    id: 'appLabReferencesPanel.referencesToSymbol',
    defaultMessage: 'References to {symbol}',
    description:
      'Accessible name of the references list, naming the symbol searched for',
  },
  references: {
    id: 'appLabReferencesPanel.references',
    defaultMessage: 'References',
    description:
      'Accessible name of the references list when the symbol searched for is not known',
  },
  referenceAtLine: {
    id: 'appLabReferencesPanel.referenceAtLine',
    defaultMessage: '{fileName} line {lineNumber}: {excerpt}',
    description: 'Accessible name of a single reference in the list',
  },
});
