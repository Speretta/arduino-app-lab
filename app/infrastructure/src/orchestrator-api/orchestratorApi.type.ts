import { components, operations } from './orchestrator-api';

// models
// The release fields of arduino-app-cli 0.14.0-rc.5, not yet in the generated
// spec.
interface ReleaseAppFields {
  release?: boolean;
  release_label?: string;
  created_at?: string | null;
}
export type AppInfo = components['schemas']['AppInfo'] & ReleaseAppFields;
export type AppDetailedInfo = components['schemas']['AppDetailedInfo'] &
  ReleaseAppFields & {
    notes?: string;
  };
export type AppStatus = components['schemas']['Status'];
export type UpdateAppDetailRequest = components['schemas']['EditRequest'];
export type CloneAppRequest = components['schemas']['CloneRequest'];
export type CloneAppResult = components['schemas']['CloneAppResponse'];
export type CreateAppRequest = components['schemas']['CreateAppRequest'];
export type CreateAppResult = components['schemas']['CreateAppResponse'];

type ConfigDirs = components['schemas']['ConfigDirectories'];

export type AppBrickDetails = components['schemas']['AppBrickInstanceDetails'];
export type AppBrickListItem =
  components['schemas']['AppBrickInstanceListItem'];
export type BrickListItem = components['schemas']['BrickListItem'];

type KnownAiFramework = 'edgeimpulse' | 'genie' | 'llamacpp' | 'qnn';

export type AiFramework =
  | KnownAiFramework
  // eslint-disable-next-line @typescript-eslint/ban-types
  | (string & {});

export type BrickDetails = Omit<
  components['schemas']['BrickDetailsResult'],
  'ai_frameworks_compatibility'
> & { ai_frameworks_compatibility?: AiFramework[] };

export type AppReference = components['schemas']['AppReference'];
export type BrickCreateUpdateRequest =
  components['schemas']['BrickCreateUpdateRequest'];
export type BrickConfigVariable = components['schemas']['BrickConfigVariable'];
export type BrickModel = components['schemas']['AIModel'];
export type AIModelItem = components['schemas']['AIModelItem'] &
  Required<Pick<components['schemas']['AIModelItem'], 'id'>>;
export type ModelOrigin = components['schemas']['ModelOrigin'];
export type DownloadAIModelRequest =
  components['schemas']['DownloadModelRequest'];

export type AppPort = components['schemas']['Port'];

export type SystemPropertyKeysResponse =
  components['schemas']['PropertyKeysResponse'];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SystemPropertyValue = any;

export type SketchLibrary = components['schemas']['Library'];

// operations
export type ListAppParams = operations['getApps']['parameters'];
export type ListAppResult = components['schemas']['AppListResponse'];
export type ListAppBrickInstancesResult =
  components['schemas']['AppBrickInstancesResult'];
export type ListAppPortsResult = components['schemas']['AppPortResponse'];

export type GetConfigResult = components['schemas']['ConfigResponse'];

export type ExampleInfo = components['schemas']['Example'];
export type ExampleCatalogResult = components['schemas']['ExampleResponse'];

export type ListBrickResult = components['schemas']['BrickListResult'];

export type UpdateCheckResult = components['schemas']['UpdateCheckResult'];

export type ListLibrariesParams = operations['listLibraries']['parameters'];
export type LibraryListResponse = components['schemas']['LibraryListResponse'];

export type AIModelsListResult = Omit<
  components['schemas']['AIModelsListResult'],
  'models'
> & { models?: AIModelItem[] | null };

// others
export interface AppConfig {
  directories?: ConfigDirs;
}

export enum StreamEventType {
  App = 'app',
  Message = 'message',
  Error = 'error',
  Progress = 'progress',
  Close = 'close',
  Done = 'done',
}

export interface MessageData {
  id: string;
  message: string;
  container_name?: string;
}

export interface ErrorData {
  code: string;
  message?: string;
}

interface ProgressData {
  progress: number;
}

export type StreamEvent =
  | { event: StreamEventType.App; data: AppDetailedInfo }
  | { event: StreamEventType.Message; data: MessageData }
  | { event: StreamEventType.Error; data: ErrorData }
  | { event: StreamEventType.Progress; data: ProgressData }
  | { event: StreamEventType.Close; data: string }
  | { event: StreamEventType.Done; data: string };

export enum SystemResourcesStreamMessageType {
  Cpu = 'cpu',
  Memory = 'mem',
  Disk = 'disk',
  Npu = 'npu',
  Error = 'error',
}

type BoardUpdateLogEvent =
  | 'starting'
  | 'log'
  | 'progress'
  | 'restarting'
  | 'done'
  | 'close'
  | 'error';

export interface BoardUpdateLog {
  data: string;
  event: BoardUpdateLogEvent;
}

// Payload of the `progress` event on GET /v1/system/update/events
// (arduino-app-cli 2c31505). `progress` is a 0-100 percentage of the whole
// update, not the 0-1 fraction `StreamEventType.Progress` carries on
// startApp/stopApp. Hand-written until the endpoint's spec is regenerated.
export interface BoardUpdateProgress {
  step: string;
  progress: number;
}

export interface Version {
  version: string;
}

// Hand-written from arduino-app-cli 0.14.0-rc.5 (internal/api/docs/openapi.yaml)
// until the generated spec is regenerated.
export interface CreateReleaseRequest {
  // Left out, the daemon builds for the board that runs the build.
  target?: string;
  include_data?: boolean;
  // Markdown, stored in the manifest as given.
  notes?: string;
  release_label?: string;
}

export type ReleaseBuildRequest = CreateReleaseRequest & {
  // Tags the events of this build on GET /v1/apps/build/events.
  build_id: string;
};

// release.yaml, at the root of a release archive and in the folder of an
// installed release.
export interface ReleaseManifest {
  name: string;
  release_label?: string;
  created_at: string;
  notes?: string;
}

// `done` payload of PUT /v1/apps/install.
export interface ReleaseInstallResult {
  id: string;
  name: string;
}
