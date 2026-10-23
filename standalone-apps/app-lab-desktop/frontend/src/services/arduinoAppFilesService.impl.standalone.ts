import { ArduinoAppFilesService } from '@cloud-editor-mono/domain/src/services/services-by-app/app-lab';

import {
  CreateFolder,
  GetFileContent,
  ImportFileToAppFromPath,
  ImportFolderToAppFromPath,
  IsLocalDirectory,
  ListDirectory,
  RemoveFile,
  RenameFile,
  RenameFolder,
  SelectFilesDialog,
  SelectFolderDialog,
  StatPath,
  UnwatchAll,
  UnwatchApp,
  UnwatchAppsDir,
  WatchApp,
  WatchAppsDir,
  WriteFileContent,
} from '../../wailsjs/go/app/App';
import { EventsOn, OnFileDrop } from '../../wailsjs/runtime';
import { mapFSNode } from './orchestratorService.mapper';

type DroppedItem = { path: string; isFolder: boolean };
type DropHandler = (items: DroppedItem[]) => void;

/**
 * Native file drops, kept deliberately off the Wails `wails:file-drop` event.
 *
 * The backend subscribes to that event to record the dropped paths as readable
 * for this session (see `internal/app/lifecycle.go`), and re-emits them under
 * `host-file-drop`. Two rules follow, and both are why this is a module-level
 * singleton rather than a per-caller subscription:
 *
 *  - Never unsubscribe from `wails:file-drop`. `EventsOff` (which
 *    `OnFileDropOff` calls, and which the last listener's own unsubscribe also
 *    triggers) is forwarded to the Go event bus, where it deletes *every*
 *    listener for that name - the backend's included. The backend registers
 *    once at startup, so losing it means every later drop is refused as a path
 *    the session never saw.
 *  - Listening to `host-file-drop` also means the paths cannot arrive before
 *    the backend has recorded them.
 *
 * One consumer is active at a time: the most recently subscribed one still
 * present. Letting every subscriber see the same drop would run two imports
 * for it.
 */
const HOST_FILE_DROP_EVENT = 'host-file-drop';

const dropHandlerStack: DropHandler[] = [];
let dropBridgeInstalled = false;

const installDropBridge = (): void => {
  if (dropBridgeInstalled) {
    return;
  }
  dropBridgeInstalled = true;

  // Registered for its side effects only, and never turned off: it installs the
  // dragover/drop DOM handlers that let a drop through, and on Windows the
  // WebView2 bridge that resolves the dropped items to real paths. The paths
  // themselves come from the backend, on HOST_FILE_DROP_EVENT.
  OnFileDrop(() => undefined, false);

  EventsOn(
    HOST_FILE_DROP_EVENT,
    async (x: number, y: number, paths: string[]) => {
      const handler = dropHandlerStack[dropHandlerStack.length - 1];
      if (!handler) {
        return;
      }

      const element = document.elementFromPoint(x, y);
      const dropzone = element?.closest('[data-native-dropzone="true"]');
      if (!element || !dropzone) {
        return;
      }

      const items = await Promise.all(
        paths.map(async (path) => {
          let isFolder = false;
          try {
            isFolder = await IsLocalDirectory(path);
          } catch {
            isFolder = false;
          }
          return { path, isFolder };
        }),
      );

      handler(items);
    },
  );
};

export const getAppFileContent: ArduinoAppFilesService['getAppFileContent'] =
  async function (path: string) {
    return GetFileContent(path);
  };

export const listAppDirectory: ArduinoAppFilesService['listAppDirectory'] =
  async function (appPath: string, relDirPath = '') {
    const entries = await ListDirectory(
      relDirPath ? `${appPath}/${relDirPath}` : appPath,
    );

    return entries.map((entry) => {
      const node = mapFSNode(entry);
      const path = relDirPath ? `${relDirPath}/${entry.name}` : entry.name;
      // A shallow listing says nothing about a subfolder's contents, whereas
      // mapFSNode reports the absent children as an empty folder.
      return node.type === 'folder'
        ? { ...node, path, children: null }
        : { ...node, path };
    });
  };

export const statAppPath: ArduinoAppFilesService['statAppPath'] =
  async function (path: string) {
    const node = await StatPath(path);
    return node ? { isDir: node.isDir } : null;
  };

export const saveAppFile: ArduinoAppFilesService['saveAppFile'] =
  async function (path: string, content: string, suppressWatch = true) {
    return WriteFileContent(path, content, suppressWatch);
  };

export const createAppFile: ArduinoAppFilesService['createAppFile'] =
  async function (path: string, content: string = '', suppressWatch = true) {
    return WriteFileContent(path, content, suppressWatch);
  };

export const renameAppFile: ArduinoAppFilesService['renameAppFile'] =
  async function (
    path: string,
    newName: string,
    nodeType?: 'file' | 'folder',
    suppressWatch = true,
  ) {
    if (nodeType === 'folder') {
      return RenameFolder(path, newName, suppressWatch);
    } else {
      return RenameFile(path, newName, suppressWatch);
    }
  };

export const removeAppFile: ArduinoAppFilesService['removeAppFile'] =
  async function (path: string, suppressWatch = true) {
    return RemoveFile(path, suppressWatch);
  };

export const createAppFolder: ArduinoAppFilesService['createAppFolder'] =
  async function (path: string, suppressWatch = true) {
    return CreateFolder(path, suppressWatch);
  };

export const importResourceToAppFromPath: ArduinoAppFilesService['importResourceToAppFromPath'] =
  async function (
    remoteDir: string,
    filePath: string,
    isFolder?: boolean,
    newFileName?: string,
    suppressWatch = true,
  ) {
    let result;

    if (isFolder) {
      result = await ImportFolderToAppFromPath(
        remoteDir,
        filePath,
        newFileName ?? '',
        suppressWatch,
      );
    } else {
      result = await ImportFileToAppFromPath(
        remoteDir,
        filePath,
        newFileName ?? '',
        suppressWatch,
      );
    }

    const name = result.split('/').pop() ?? '';
    return { id: result, name };
  };

export const importDroppedResourceToApp: ArduinoAppFilesService['importDroppedResourceToApp'] =
  function (callback) {
    installDropBridge();

    dropHandlerStack.push(callback);

    return () => {
      const index = dropHandlerStack.indexOf(callback);
      if (index !== -1) {
        dropHandlerStack.splice(index, 1);
      }
    };
  };

export const watchApp: ArduinoAppFilesService['watchApp'] = (path) =>
  WatchApp(path);

export const unwatchApp: ArduinoAppFilesService['unwatchApp'] = (path) =>
  UnwatchApp(path);

export const watchAppsDir: ArduinoAppFilesService['watchAppsDir'] = (path) =>
  WatchAppsDir(path);

export const unwatchAppsDir: ArduinoAppFilesService['unwatchAppsDir'] = (
  path,
) => UnwatchAppsDir(path);

export const unwatchAll: ArduinoAppFilesService['unwatchAll'] = () =>
  UnwatchAll();

export const selectResourcePathToImport: ArduinoAppFilesService['selectResourcePathToImport'] =
  async function (remoteDir, isFolder = false) {
    try {
      if (isFolder) {
        const result = await SelectFolderDialog(remoteDir);
        return result || null;
      } else {
        const result = await SelectFilesDialog(remoteDir);
        return result && result.length > 0 ? result : null;
      }
    } catch (error) {
      console.error('Error opening dialog:', error);
      return null;
    }
  };
