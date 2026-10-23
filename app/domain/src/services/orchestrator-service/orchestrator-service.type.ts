import {
  AIModelItem,
  AppBrickDetails,
  AppBrickListItem,
  AppConfig,
  AppDetailedInfo,
  AppInfo,
  AppPort,
  BrickCreateUpdateRequest,
  BrickDetails,
  BrickListItem,
  CloneAppRequest,
  CreateAppRequest,
  CreateReleaseRequest,
  EventSourceHandlers,
  ExampleCatalogResult,
  LibraryListResponse,
  ListAppParams,
  ListLibrariesParams,
  ReleaseInstallResult,
  ReleaseManifest,
  SystemPropertyValue,
  UpdateAppDetailRequest,
  UpdateCheckResult,
  WebSocketHandlers,
} from '@cloud-editor-mono/infrastructure';
import { ImportResourceResult } from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';

export interface OrchestratorService {
  getApps(params: ListAppParams): Promise<AppInfo[]>;
  getAppStatus(
    handlers: EventSourceHandlers,
    abortController?: AbortController,
  ): Promise<void>;
  getAppDetail(id: string): Promise<AppDetailedInfo>;
  updateAppDetail(
    id: string,
    body: UpdateAppDetailRequest,
  ): Promise<string | undefined>;
  createApp(body: CreateAppRequest): Promise<string | undefined>;
  cloneApp(id: string, body?: CloneAppRequest): Promise<string | undefined>;
  // Resolves with the release archive once the build is over. Progress is on
  // getReleaseBuildEvents, under the build id the caller picks; aborting the
  // controller stops the build.
  startReleaseBuild(
    id: string,
    buildId: string,
    body: CreateReleaseRequest,
    abortController?: AbortController,
  ): Promise<Blob>;
  getReleaseBuildEvents(
    handlers: EventSourceHandlers,
    abortController?: AbortController,
  ): Promise<void>;
  // Asks where a release goes. `undefined` means the user closed the dialog.
  chooseReleaseSavePath(defaultFileName: string): Promise<string | undefined>;
  writeReleaseFile(filePath: string, archive: Blob): Promise<void>;
  // Downloads the containers and models of an installed release.
  prepareApp(
    id: string,
    handlers: EventSourceHandlers,
    abortController?: AbortController,
  ): Promise<void>;
  readReleaseManifest(filePath: string): Promise<ReleaseManifest>;
  readReleaseArchive(filePath: string): Promise<Blob>;
  installRelease(
    archive: Blob,
    fileName: string,
    abortController?: AbortController,
  ): Promise<ReleaseInstallResult>;
  deleteApp(id: string): Promise<boolean>;
  exportApp(
    id: string,
    appName: string,
    includeData: boolean,
  ): Promise<boolean>;
  /**
   * Fetches the app packaged as a ZIP, for callers that need the bytes rather
   * than a file on disk (e.g. uploading it to Project Hub).
   */
  exportAppArchive(
    id: string,
    includeData: boolean,
    abortController?: AbortController,
  ): Promise<Blob>;
  getFileContent(path: string): Promise<string>;
  startApp(
    id: string,
    handlers: EventSourceHandlers,
    abortController?: AbortController,
  ): Promise<void>;
  stopApp(
    id: string,
    handlers: EventSourceHandlers,
    abortController?: AbortController,
  ): Promise<void>;
  getAppLogs(
    id: string,
    handlers: EventSourceHandlers,
    abortController?: AbortController,
  ): Promise<void>;
  getSerialMonitorLogs(handlers: WebSocketHandlers): Promise<WebSocket>;
  getAppPorts(id: string): Promise<AppPort[]>;
  getAppBricks(id: string, params?: never): Promise<AppBrickListItem[]>;
  getAppBrickInstance(appId: string, brickId: string): Promise<AppBrickDetails>;
  addAppBrick(
    appId: string,
    brickId: string,
    params: BrickCreateUpdateRequest,
  ): Promise<boolean>;
  deleteAppBrick(appId: string, brickId: string): Promise<boolean>;
  updateAppBrick(
    appId: string,
    brickId: string,
    params: BrickCreateUpdateRequest,
  ): Promise<boolean>;
  addAppCustomBrick(
    appId: string,
    body: { name: string; description?: string },
  ): Promise<{ id: string }>;
  renameAppCustomBrick(
    appId: string,
    brickId: string,
    params: { name: string },
  ): Promise<string | null>;
  getBricks(): Promise<BrickListItem[]>;
  getExamples(): Promise<ExampleCatalogResult>;
  getBrickDetails(id: string): Promise<BrickDetails>;
  getConfig(): Promise<AppConfig>;
  getSystemResources(
    handlers: EventSourceHandlers,
    abortController?: AbortController,
  ): Promise<void>;
  checkBoardUpdate(onlyArduino: boolean): Promise<UpdateCheckResult>;
  getBoardUpdateLogs(
    handlers: EventSourceHandlers,
    abortController?: AbortController,
  ): Promise<void>;
  applyBoardUpdate(onlyArduino: boolean): Promise<boolean | null>;
  getVersion(): Promise<string>;
  getSystemPropertyKeys(): Promise<string[]>;
  getSystemProperty(key: string): Promise<SystemPropertyValue>;
  upsertSystemProperty(
    key: string,
    value: string,
  ): Promise<SystemPropertyValue>;
  deleteSystemProperty(key: string): Promise<SystemPropertyValue>;
  getSketchLibraries(params: ListLibrariesParams): Promise<LibraryListResponse>;
  getAppSketchLibraries(appId: string): Promise<{ libraries: string[] }>;
  addAppSketchLibrary(appId: string, libRef: string): Promise<void>;
  deleteAppSketchLibrary(appId: string, libRef: string): Promise<void>;
  selectAppPathToImport: () => Promise<string | string[] | null>;
  importAppFromPath(filePath: string): Promise<ImportResourceResult>;
  getAIModels(): Promise<AIModelItem[]>;
  installEIModel(projectId: string, impulseId: string): Promise<AIModelItem>;
  deleteAIModel(id: string, isForced?: boolean): Promise<void>;
  installAIModel(
    modelId: string,
    handlers: EventSourceHandlers,
    abortController: AbortController,
  ): Promise<void>;
  downloadAIModel(
    source: string,
    handlers: EventSourceHandlers,
    abortController: AbortController,
    mmprojUrl?: string,
  ): Promise<void>;
}
