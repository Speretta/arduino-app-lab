import { defineMessages } from 'react-intl';

export const messages = defineMessages({
  overviewTab: {
    id: 'brickDetail.overview',
    defaultMessage: 'Overview',
    description: 'Label for the overview tab',
  },
  examplesTab: {
    id: 'brickDetail.examples',
    defaultMessage: 'Usage examples',
    description: 'Label for the examples tab',
  },
  documentationTab: {
    id: 'brickDetail.documentation',
    defaultMessage: 'API documentation',
    description: 'Label for the documentation tab',
  },
  aiModelsTab: {
    id: 'brickDetail.aiModels',
    defaultMessage: 'AI Models',
    description: 'Label for the AI models tab',
  },
  fileNotFound: {
    id: 'brickDetail.fileNotFound',
    defaultMessage: 'File not found',
    description: 'Message displayed when a file is not found',
  },
  configureButton: {
    id: 'brickDetail.configureButton',
    defaultMessage: 'Brick configuration',
    description: 'Label for the configure button',
  },
  usedInTitle: {
    id: 'brickDetail.usedInTitle',
    defaultMessage: 'Used in',
    description: 'Title for the section listing apps that use the brick',
  },
  seeExample: {
    id: 'brickDetail.seeExample',
    defaultMessage: 'See example',
    description: 'Label for the button to see the example',
  },
  suggestedModelsSectionTitle: {
    id: 'brickDetail.suggestedModelsSectionTitle',
    defaultMessage: 'Suggested models',
    description:
      'Title of the section listing the models suggested for a brick',
  },
  userModelSectionTitle: {
    id: 'brickDetail.userModelSectionTitle',
    defaultMessage: 'Bring your own model',
    description:
      'Title of the section to link a user-provided AI model to the brick',
  },
  trainNewModelSectionTitle: {
    id: 'brickDetail.trainNewModelSectionTitle',
    defaultMessage: 'Train new AI Model on Edge Impulse',
    description: 'Title of the section to train a new AI model on Edge Impulse',
  },
  trainNewModelButton: {
    id: 'brickDetail.trainNewModelButton',
    defaultMessage: 'Train new AI Model',
    description: 'Label for the button to train a new AI model',
  },
  trainNewModelDescription: {
    id: 'brickDetail.trainNewModelDescription',
    defaultMessage:
      'Create and train your own AI Model using Edge Impulse Studio. An <strong>Arduino account login is required.</strong>',
    description: 'Description for the action to train a new AI model',
  },
  linkHuggingFaceButton: {
    id: 'brickDetail.linkHuggingFaceButton',
    defaultMessage: 'Add model from Hugging Face',
    description: 'Label for the button to add a model from Hugging Face',
  },
});
