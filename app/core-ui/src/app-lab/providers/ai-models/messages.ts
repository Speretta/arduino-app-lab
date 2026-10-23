import { defineMessages } from 'react-intl';

export const aiModelsMessages = defineMessages({
  modelDownloaded: {
    id: 'aiModelsContext.modelDownloaded',
    defaultMessage: 'Model {name} downloaded',
    description: 'Notification shown when an AI model finished downloading',
  },
  modelAlreadyInstalled: {
    id: 'aiModelsContext.modelAlreadyInstalled',
    defaultMessage: 'Model {name} is already installed',
    description:
      'Notification shown when a download finishes on a model that was installed before it started',
  },
  modelDownloadedTooltip: {
    id: 'aiModelsContext.modelDownloadedTooltip',
    defaultMessage: 'Click to view in My Apps',
    description: 'Tooltip of the footer notification for a downloaded AI model',
  },
  insufficientStorage: {
    id: 'aiModelsContext.insufficientStorage',
    defaultMessage: 'Insufficient space on the board.',
    description:
      'Error shown when the board has no room left for the model being downloaded',
  },
  downloadEndedUnexpectedly: {
    id: 'aiModelsContext.downloadEndedUnexpectedly',
    defaultMessage: 'The model download ended unexpectedly',
    description:
      'Error shown when the model download stream ends without reporting a result',
  },
  downloadFailed: {
    id: 'aiModelsContext.downloadFailed',
    defaultMessage: 'An error occurred while downloading model',
    description: 'Generic error shown when an AI model download fails',
  },
  updateAppLab: {
    id: 'aiModelsContext.updateAppLab',
    defaultMessage: 'Update App Lab in Settings to link a model.',
    description:
      'Notification shown when the running App Lab is too old to download a model from a url',
  },
  goToSettings: {
    id: 'aiModelsContext.goToSettings',
    defaultMessage: 'Go to settings',
    description:
      'Action of the notification that asks the user to update App Lab',
  },
  downloadFailedWithReason: {
    id: 'aiModelsContext.downloadFailedWithReason',
    defaultMessage: 'Error downloading model: {reason}',
    description:
      'Error shown when an AI model download fails with a reported reason',
  },
});
