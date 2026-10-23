import { defineMessages } from 'react-intl';

export const messages = defineMessages({
  sidebarCollapse: {
    id: 'app-files-section.sidebar-collapse',
    defaultMessage: 'Collapse',
    description: 'Label sidebar toggle button',
  },
  sidebarExpand: {
    id: 'app-files-section.sidebar-expand',
    defaultMessage: 'Expand',
    description: 'Label sidebar toggle button',
  },
  bricksLabel: {
    id: 'app-files-section.bricks-label',
    defaultMessage: 'Bricks',
    description: 'Label for the Bricks section in the App Files Section',
  },
  sketchLibrariesLabel: {
    id: 'app-files-section.sketch-libraries-label',
    defaultMessage: 'Sketch libraries',
    description:
      'Label for the Sketch libraries section in the App Files Section',
  },
  filesLabel: {
    id: 'app-files-section.files-label',
    defaultMessage: 'Files',
    description: 'Label for the Files section in the App Files Section',
  },
  addBrickButton: {
    id: 'app-files-section.add-brick-button',
    defaultMessage: 'Add Brick',
    description: 'Button text to add a new brick to the app',
  },
  addSketchLibraryButton: {
    id: 'app-files-section.add-sketch-library-button',
    defaultMessage: 'Add sketch library',
    description: 'Button text to add a new sketch library to the app',
  },
  addFileButton: {
    id: 'app-files-section.add-file-button',
    defaultMessage: 'Add file',
    description: 'Button text to add a new file to the app',
  },
  noBricksAddedYet: {
    id: 'app-files-section.no-bricks-added-yet',
    defaultMessage: 'No Bricks added yet',
    description: 'Message shown when there are no bricks added to the app',
  },
  noSketchLibrariesAddedYet: {
    id: 'app-files-section.no-sketch-libraries-added-yet',
    defaultMessage: 'No sketch libraries added yet',
    description:
      'Message shown when there are no sketch libraries added to the app',
  },
  releaseReadonly: {
    id: 'app-files-section.release-readonly',
    defaultMessage: "Items can't be added in releases",
    description: 'Message shown on disabled action buttons for releases',
  },
  exampleReadonly: {
    id: 'app-files-section.example-readonly',
    defaultMessage: "Items can't be added in examples",
    description: 'Message shown on disabled action buttons for examples',
  },
  noSketchPopoverText: {
    id: 'app-files-section.no-sketch-popover-text',
    defaultMessage:
      'To add a sketch library, your App must include a sketch folder containing:',
    description:
      'Popover on the disabled add sketch library button when the app has no sketch. A list of the two file names follows it.',
  },
  addSketchFolderButton: {
    id: 'app-files-section.add-sketch-folder-button',
    defaultMessage: 'Add sketch folder',
    description:
      'Button in the no-sketch popover that creates the sketch folder with sketch.ino and sketch.yaml',
  },
  offlinePopoverText: {
    id: 'app-files-section.offline-popover-text',
    defaultMessage: 'Connect your {boardType} to the internet to use libraries',
    description:
      'Popover on the disabled add sketch library button when the board has no internet. boardType is the board type, for example Arduino UNO Q',
  },
  offlinePopoverBoardFallback: {
    id: 'app-files-section.offline-popover-board-fallback',
    defaultMessage: 'board',
    description:
      'Used in the offline popover text in place of the board type when the type is not known',
  },
  offlinePopoverConnectButton: {
    id: 'app-files-section.offline-popover-connect-button',
    defaultMessage: 'CONNECT',
    description:
      'Button in the offline popover that opens the network settings dialog. Written in capitals.',
  },
  lspBannerWaitingTitle: {
    id: 'app-files-section.lsp-banner-waiting-title',
    defaultMessage: 'Installing advanced language support',
    description:
      'Title of the banner shown when LSP is not available for the current app',
  },
  lspBannerWaitingDescription: {
    id: 'app-files-section.lsp-banner-waiting-description',
    defaultMessage: 'This may take a few minutes.',
    description:
      'Description of the banner shown when LSP is not available for the current app',
  },
});
