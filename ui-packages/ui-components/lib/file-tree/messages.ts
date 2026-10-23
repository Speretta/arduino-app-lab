import { defineMessages } from 'react-intl';

export const messages = defineMessages({
  createFile: {
    id: 'fileTree.createFile',
    defaultMessage: 'Create new file',
    description: 'Context menu item for creating a new file in the file tree',
  },
  createFolder: {
    id: 'fileTree.createFolder',
    defaultMessage: 'Create new folder',
    description: 'Context menu item for creating a new folder in the file tree',
  },
  importFile: {
    id: 'fileTree.importFile',
    defaultMessage: 'Import file',
    description: 'Context menu item for importing a file in the file tree',
  },
  importFolder: {
    id: 'fileTree.importFolder',
    defaultMessage: 'Import folder',
    description: 'Context menu item for importing a folder in the file tree',
  },
  addSketchFolder: {
    id: 'fileTree.addSketchFolder',
    defaultMessage: 'Add sketch folder',
    description:
      'Context menu item that creates the sketch folder with sketch.ino and sketch.yaml',
  },
  addSketchLibrary: {
    id: 'fileTree.addSketchLibrary',
    defaultMessage: 'Add sketch library',
    description: 'Context menu item that opens the add sketch library dialog',
  },
  addBrick: {
    id: 'fileTree.addBrick',
    defaultMessage: 'Add Brick',
    description: 'Context menu item that opens the add Brick dialog',
  },
  createBrick: {
    id: 'fileTree.createBrick',
    defaultMessage: 'Create new Brick',
    description: 'Context menu item that opens the create Brick dialog',
  },
  rename: {
    id: 'fileTree.rename',
    defaultMessage: 'Rename',
    description:
      'Context menu item for renaming a file or folder in the file tree',
  },
  delete: {
    id: 'fileTree.delete',
    defaultMessage: 'Delete',
    description:
      'Context menu item for deleting a file or folder in the file tree',
  },
});
