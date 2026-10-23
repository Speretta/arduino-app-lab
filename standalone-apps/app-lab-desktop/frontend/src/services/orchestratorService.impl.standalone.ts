/* eslint-disable no-empty */
import { assertNonNull, Config } from '@cloud-editor-mono/common';
import {
  applyBoardUpdateWailsFallback,
  checkBoardUpdateWailsFallback,
  getBoardUpdateLogsWailsFallback,
  getEIProjectAPIKey,
  OrchestratorService,
} from '@cloud-editor-mono/domain/src/services/services-by-app/app-lab';
import {
  addAppBrickV1Request,
  addAppCustomBrickV1Request,
  addAppSketchLibraryV1Request,
  AIModelItem,
  applyBoardUpdateV1Request,
  BrickCreateUpdateRequest,
  checkBoardUpdateV1Request,
  cloneAppV1Request,
  createAppBuildV1Request,
  createAppV1Request,
  deleteAIModelV1Request,
  deleteAppBrickV1Request,
  deleteAppSketchLibraryV1Request,
  deleteAppV1Request,
  deleteSystemPropertyV1Request,
  downloadAIModelV1Request,
  EventSourceHandlers,
  exportAppArchiveV1Request,
  getAIModelsV1Request,
  getAppBrickInstanceV1Request,
  getAppBricksV1Request,
  getAppBuildEventsStreamV1Request,
  getAppDetailV1Request,
  getAppLogsStreamV1Request,
  getAppPortsV1Request,
  getAppSketchLibrariesV1Request,
  getAppStatusStreamV1Request,
  getAppsV1Request,
  getBoardUpdateLogsStreamV1Request,
  getBrickDetailsV1Request,
  getBricksV1Request,
  getConfigV1Request,
  getExamplesV1Request,
  getSerialMonitorLogsStreamV1Request,
  getSketchLibrariesV1Request,
  getSystemPropertyKeysV1Request,
  getSystemPropertyV1Request,
  getSystemResourcesStreamV1Request,
  getVersionV1Request,
  installAIModelV1Request,
  installAppReleaseV1Request,
  installEIModelV1Request,
  ListAppParams,
  ListLibrariesParams,
  postAppStartStreamV1Request,
  postAppStopStreamV1Request,
  prepareAppV1Request,
  renameAppCustomBrickV1Request,
  updateAppBrickV1Request,
  updateAppDetailV1Request,
  upsertSystemPropertyV1Request,
  WebSocketHandlers,
} from '@cloud-editor-mono/infrastructure';
import { ImportResourceResult } from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';

import {
  ChooseReleaseSavePath,
  ExportApp,
  ForgetWorkspaceApp,
  GetFileContent,
  GetOrchestratorURL,
  ImportAppFromPath,
  ReadReleaseArchive,
  ReadReleaseManifest,
  RebindWorkspaceApp,
  SelectAppDialog,
  WriteReleaseFile,
} from '../../wailsjs/go/app/App';

const getOrchestratorURL = async (): Promise<string | undefined> => {
  try {
    // Board and desktop use case
    if (Config.FORCE_IS_BOARD) {
      return Config.ORCHESTRATOR_API_URL;
    }

    return await GetOrchestratorURL();
  } catch {
    // Local development use case or fallback
    // (use default params in orchestratorApi.ts)
    return undefined;
  }
};

export const getApps: OrchestratorService['getApps'] = async function (
  req: ListAppParams,
) {
  const origin = await getOrchestratorURL();

  const response = await getAppsV1Request(req, origin);
  return response.apps || [];
};

export const getAppDetail: OrchestratorService['getAppDetail'] =
  async function (id: string) {
    const origin = await getOrchestratorURL();

    return getAppDetailV1Request(id, origin);
  };

export const updateAppDetail: OrchestratorService['updateAppDetail'] =
  async function (id: string, body) {
    const origin = await getOrchestratorURL();
    const newId = await updateAppDetailV1Request(id, body, origin);
    // A rename mints a new app id: carry the agent's workspace across here rather than in the screens that rename, so no future caller can forget it.
    if (newId && newId !== id) {
      await RebindWorkspaceApp(id, newId, body.name ?? '');
    }
    return newId;
  };

export const createApp: OrchestratorService['createApp'] = async function (
  body,
) {
  const origin = await getOrchestratorURL();
  return createAppV1Request(body, origin);
};

export const cloneApp: OrchestratorService['cloneApp'] = async function (
  id: string,
  body,
) {
  const origin = await getOrchestratorURL();
  return cloneAppV1Request(id, body, origin);
};

// Wails passes bytes to and from Go as base64 strings.
const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (): void =>
      resolve(
        String(reader.result).slice(String(reader.result).indexOf(',') + 1),
      );
    reader.onerror = (): void => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const base64ToBlob = (base64: string): Blob => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'application/gzip' });
};

export const startReleaseBuild: OrchestratorService['startReleaseBuild'] =
  async function (id, buildId, body, abortController) {
    const origin = await getOrchestratorURL();
    return createAppBuildV1Request(
      id,
      { ...body, build_id: buildId },
      abortController,
      origin,
    );
  };

export const getReleaseBuildEvents: OrchestratorService['getReleaseBuildEvents'] =
  async function (handlers: EventSourceHandlers, abortController) {
    const origin = await getOrchestratorURL();
    return getAppBuildEventsStreamV1Request(handlers, abortController, origin);
  };

export const chooseReleaseSavePath: OrchestratorService['chooseReleaseSavePath'] =
  async function (defaultFileName) {
    const filePath = await ChooseReleaseSavePath(defaultFileName);
    return filePath || undefined;
  };

export const writeReleaseFile: OrchestratorService['writeReleaseFile'] =
  async function (filePath, archive) {
    return WriteReleaseFile(filePath, await blobToBase64(archive));
  };

export const prepareApp: OrchestratorService['prepareApp'] = async function (
  id: string,
  handlers: EventSourceHandlers,
  abortController,
) {
  const origin = await getOrchestratorURL();
  return prepareAppV1Request(id, handlers, abortController, origin);
};

export const readReleaseManifest: OrchestratorService['readReleaseManifest'] =
  async function (filePath) {
    return ReadReleaseManifest(filePath);
  };

export const readReleaseArchive: OrchestratorService['readReleaseArchive'] =
  async function (filePath) {
    return base64ToBlob(await ReadReleaseArchive(filePath));
  };

export const installRelease: OrchestratorService['installRelease'] =
  async function (archive, fileName, abortController) {
    const origin = await getOrchestratorURL();
    return installAppReleaseV1Request(
      archive,
      fileName,
      abortController,
      origin,
    );
  };

export const deleteApp: OrchestratorService['deleteApp'] = async function (
  id: string,
) {
  const origin = await getOrchestratorURL();
  const deleted = await deleteAppV1Request(id, origin);
  // The id is reusable by a later app of the same name, which would inherit permissions nobody granted it.
  // Go announces the drop on `agent:workspace-app-forgotten`, which is what moves any chat panel off the app.
  if (deleted) {
    await ForgetWorkspaceApp(id);
  }
  return deleted;
};

export const getFileContent: OrchestratorService['getFileContent'] =
  async function (path: string) {
    return GetFileContent(path);
  };

export const getConfig: OrchestratorService['getConfig'] = async function () {
  const origin = await getOrchestratorURL();
  return getConfigV1Request(origin);
};

export const getAppStatus: OrchestratorService['getAppStatus'] =
  async function (
    handlers: EventSourceHandlers,
    abortController?: AbortController,
  ) {
    const origin = await getOrchestratorURL();
    return getAppStatusStreamV1Request(handlers, abortController, origin);
  };

export const getAppBricks: OrchestratorService['getAppBricks'] =
  async function (id: string, _params?: never) {
    const origin = await getOrchestratorURL();

    const response = await getAppBricksV1Request(id, origin);
    return response.bricks || [];
  };

export const getAppBrickInstance: OrchestratorService['getAppBrickInstance'] =
  async function (appId: string, brickId: string) {
    const origin = await getOrchestratorURL();

    return getAppBrickInstanceV1Request(appId, brickId, origin);
  };

export const addAppBrick: OrchestratorService['addAppBrick'] = async function (
  appId: string,
  brickId: string,
  params: BrickCreateUpdateRequest,
) {
  const origin = await getOrchestratorURL();
  return addAppBrickV1Request(appId, brickId, params, origin);
};

export const deleteAppBrick: OrchestratorService['deleteAppBrick'] =
  async function (appId: string, brickId: string) {
    const origin = await getOrchestratorURL();
    return deleteAppBrickV1Request(appId, brickId, origin);
  };

export const updateAppBrick: OrchestratorService['updateAppBrick'] =
  async function (
    appId: string,
    brickId: string,
    params: BrickCreateUpdateRequest,
  ) {
    const origin = await getOrchestratorURL();
    return updateAppBrickV1Request(appId, brickId, params, origin);
  };

export const addAppCustomBrick: OrchestratorService['addAppCustomBrick'] =
  async function (
    appId: string,
    body: {
      name: string;
      description?: string;
    },
  ) {
    const origin = await getOrchestratorURL();
    return addAppCustomBrickV1Request(appId, body, origin);
  };

export const renameAppCustomBrick: OrchestratorService['renameAppCustomBrick'] =
  async function (appId: string, brickId: string, params: { name: string }) {
    const origin = await getOrchestratorURL();
    return renameAppCustomBrickV1Request(appId, brickId, params, origin);
  };

export const getBricks: OrchestratorService['getBricks'] = async function () {
  const origin = await getOrchestratorURL();

  const response = await getBricksV1Request(origin);
  return response.bricks?.filter((brick) => brick.author === 'Arduino') || [];
};

export const getExamples: OrchestratorService['getExamples'] =
  async function () {
    const origin = await getOrchestratorURL();
    return getExamplesV1Request(origin);
  };

export const getBrickDetails: OrchestratorService['getBrickDetails'] =
  async function (id: string) {
    const origin = await getOrchestratorURL();

    return getBrickDetailsV1Request(id, origin);
  };

export const startApp: OrchestratorService['startApp'] = async function (
  id: string,
  handlers: EventSourceHandlers,
  abortController?: AbortController,
) {
  const origin = await getOrchestratorURL();
  return postAppStartStreamV1Request(id, handlers, abortController, origin);
};

export const stopApp: OrchestratorService['stopApp'] = async function (
  id: string,
  handlers: EventSourceHandlers,
  abortController?: AbortController,
) {
  const origin = await getOrchestratorURL();
  return postAppStopStreamV1Request(id, handlers, abortController, origin);
};

export const getAppPorts: OrchestratorService['getAppPorts'] = async function (
  id: string,
) {
  const origin = await getOrchestratorURL();
  return getAppPortsV1Request(id, origin);
};

export const getAppLogs: OrchestratorService['getAppLogs'] = async function (
  id: string,
  handlers: EventSourceHandlers,
  abortController?: AbortController,
) {
  const origin = await getOrchestratorURL();
  return getAppLogsStreamV1Request(id, handlers, abortController, origin);
};

export const getSerialMonitorLogs: OrchestratorService['getSerialMonitorLogs'] =
  async function (handlers: WebSocketHandlers) {
    const origin = await getOrchestratorURL();
    return getSerialMonitorLogsStreamV1Request(handlers, origin);
  };

export const getSystemResources: OrchestratorService['getSystemResources'] =
  async function (
    handlers: EventSourceHandlers,
    abortController?: AbortController,
  ) {
    const origin = await getOrchestratorURL();
    return getSystemResourcesStreamV1Request(handlers, abortController, origin);
  };

export const checkBoardUpdate: OrchestratorService['checkBoardUpdate'] =
  async function (arduinoOnly: boolean) {
    const origin = await getOrchestratorURL();

    try {
      const response = await checkBoardUpdateV1Request(arduinoOnly, origin);
      return response;
    } catch (err) {
      if (err instanceof TypeError) {
        // CORS error, fallback to Wails implementation
        console.debug('Using checkBoardUpdate wails fallback');
        assertNonNull(origin);
        return checkBoardUpdateWailsFallback(origin);
      }
      if (typeof err === 'string') {
        throw new Error(err);
      }
      if (!(err instanceof Error)) {
        console.error('Check for update unknown error:', err);
        throw new Error('Unknown error');
      }
      // Check for custom error from orchestrator
      const customError = err as Error;
      try {
        const { code, details } = JSON.parse(err.message) as {
          code: number;
          details: string;
        };
        if (details) {
          const message = details || 'Unknown error';
          customError.message = `${code} - ${message}`;
        }
      } catch {}

      throw customError;
    }
  };

export const getBoardUpdateLogs: OrchestratorService['getBoardUpdateLogs'] =
  async function (
    handlers: EventSourceHandlers,
    abortController?: AbortController,
  ) {
    const origin = await getOrchestratorURL();

    try {
      // Test if the V1 endpoint is reachable
      await fetch(`${origin}/v1/version`, { method: 'HEAD' });
      await getBoardUpdateLogsStreamV1Request(
        handlers,
        abortController,
        origin,
      );
    } catch (err) {
      if (err instanceof TypeError) {
        // CORS error, fallback to Wails implementation
        console.debug('Using getBoardUpdateLogs wails fallback');
        assertNonNull(origin);
        getBoardUpdateLogsWailsFallback(origin, handlers, abortController);
      }
      throw err;
    }
  };

export const applyBoardUpdate: OrchestratorService['applyBoardUpdate'] =
  async function (arduinoOnly: boolean) {
    const origin = await getOrchestratorURL();

    try {
      const response = await applyBoardUpdateV1Request(arduinoOnly, origin);
      return response;
    } catch (err) {
      if (err instanceof TypeError) {
        // CORS error, fallback to Wails implementation
        console.debug('Using applyBoardUpdate wails fallback');
        assertNonNull(origin);
        return applyBoardUpdateWailsFallback(origin);
      }
      throw err;
    }
  };

export const getVersion: OrchestratorService['getVersion'] = async function () {
  const origin = await getOrchestratorURL();
  return getVersionV1Request(origin);
};

export const getSystemPropertyKeys: OrchestratorService['getSystemPropertyKeys'] =
  async function () {
    const origin = await getOrchestratorURL();
    const response = await getSystemPropertyKeysV1Request(origin);
    return response.keys || [];
  };

export const getSystemProperty: OrchestratorService['getSystemProperty'] =
  async function (key: string) {
    const origin = await getOrchestratorURL();
    return getSystemPropertyV1Request(key, origin);
  };

export const upsertSystemProperty: OrchestratorService['upsertSystemProperty'] =
  async function (key: string, value: string) {
    const origin = await getOrchestratorURL();
    return upsertSystemPropertyV1Request(key, value, origin);
  };

export const deleteSystemProperty: OrchestratorService['deleteSystemProperty'] =
  async function (key: string) {
    const origin = await getOrchestratorURL();
    return deleteSystemPropertyV1Request(key, origin);
  };

export const getSketchLibraries: OrchestratorService['getSketchLibraries'] =
  async function (params: ListLibrariesParams) {
    const origin = await getOrchestratorURL();
    return getSketchLibrariesV1Request(params, origin);
  };

export const getAppSketchLibraries: OrchestratorService['getAppSketchLibraries'] =
  async function (appId: string) {
    const origin = await getOrchestratorURL();
    return getAppSketchLibrariesV1Request(appId, origin);
  };

export const addAppSketchLibrary: OrchestratorService['addAppSketchLibrary'] =
  async function (appId: string, libRef: string) {
    const origin = await getOrchestratorURL();
    return addAppSketchLibraryV1Request(appId, libRef, origin);
  };

export const deleteAppSketchLibrary: OrchestratorService['deleteAppSketchLibrary'] =
  async function (appId: string, libRef: string) {
    const origin = await getOrchestratorURL();
    return deleteAppSketchLibraryV1Request(appId, libRef, origin);
  };

export const exportApp = async (
  appId: string,
  appName: string,
  includeData: boolean,
): Promise<boolean> => {
  const result = await ExportApp(appId, appName, includeData);

  return result !== '';
};

export const exportAppArchive: OrchestratorService['exportAppArchive'] =
  async function (
    appId: string,
    includeData: boolean,
    abortController?: AbortController,
  ) {
    const origin = await getOrchestratorURL();
    return exportAppArchiveV1Request(
      appId,
      includeData,
      abortController,
      origin,
    );
  };

export const importApp = async (): Promise<ImportResourceResult | null> => {
  const response = await SelectAppDialog();

  if (!response) {
    return null;
  }

  const parsed = JSON.parse(response);
  const appId = parsed.id;

  // Fetch app details to get the name
  const appDetail = await getAppDetail(appId);

  return {
    id: appId,
    name: appDetail.name,
  };
};

export const selectAppPathToImport: OrchestratorService['selectAppPathToImport'] =
  async function () {
    try {
      const result = await SelectAppDialog();
      return result && result.length > 0 ? result : null;
    } catch (error) {
      console.error('Error opening dialog:', error);
      return null;
    }
  };

export const importAppFromPath = async (
  filePath: string,
): Promise<ImportResourceResult> => {
  const response = await ImportAppFromPath(filePath);

  const parsed = JSON.parse(response);
  const appId = parsed.id;

  // Fetch app details to get the name
  const appDetail = await getAppDetail(appId);

  return {
    id: appId,
    name: appDetail.name,
  };
};

export const getAIModels: OrchestratorService['getAIModels'] =
  async (): Promise<AIModelItem[]> => {
    const origin = await getOrchestratorURL();
    const resp = await getAIModelsV1Request(origin);
    return resp.models || [];
  };

export const installAIModel: OrchestratorService['installAIModel'] = async (
  modelId: string,
  handlers: EventSourceHandlers,
  abortController: AbortController,
): Promise<void> => {
  const origin = await getOrchestratorURL();

  await installAIModelV1Request(modelId, handlers, abortController, origin);
};

export const downloadAIModel: OrchestratorService['downloadAIModel'] = async (
  source: string,
  handlers: EventSourceHandlers,
  abortController: AbortController,
  mmprojUrl?: string,
): Promise<void> => {
  const origin = await getOrchestratorURL();

  await downloadAIModelV1Request(
    source,
    handlers,
    abortController,
    origin,
    mmprojUrl,
  );
};

export const installEIModel: OrchestratorService['installEIModel'] = async (
  projectId: string,
  impulseId: string,
): Promise<AIModelItem> => {
  const [origin, apiKey] = await Promise.all([
    getOrchestratorURL(),
    getEIProjectAPIKey(projectId),
  ]);
  return installEIModelV1Request(apiKey, projectId, impulseId, origin);
};

export const deleteAIModel: OrchestratorService['deleteAIModel'] = async (
  id: string,
  isForced?: boolean,
): Promise<void> => {
  const origin = await getOrchestratorURL();

  await deleteAIModelV1Request(id, origin, isForced);
};
