import { AppDetailedInfo, AppStatus } from '@cloud-editor-mono/infrastructure';

import {
  CreateAppDialogLogic,
  DeleteAppDialogLogic,
  ExportAppDialogLogic,
  PublishAppDialogLogic,
  ReleaseInfoDialogLogic,
} from '../../../dialogs';

export enum AppAction {
  Rename = 'RENAME',
  Duplicate = 'DUPLICATE',
  Export = 'EXPORT',
  CreateRelease = 'CREATE_RELEASE',
  ReleaseInfo = 'RELEASE_INFO',
  Publish = 'PUBLISH',
  Delete = 'DELETE',
}

export type AppTitleLogic = () => {
  app: AppDetailedInfo | undefined;
  appStatus?: AppStatus;
  // Set while a release of this App is being created.
  createReleaseDisabledReason?: string;
  name: string;
  editing: boolean;
  hasError: boolean;
  defaultApp?: AppDetailedInfo;
  setAsDefaultApp?: (isSelected: boolean) => Promise<void>;
  openApp?: (app: AppDetailedInfo) => void;
  onAppNameChange: (value: string) => void;
  onAppAction: (action: AppAction) => void;
  onResetAppName: () => void;
  onRenameApp: () => void;
  onUpdateAppIcon: (emoji: string) => Promise<boolean>;
  deleteAppDialogLogic: DeleteAppDialogLogic;
  createAppDialogLogic: CreateAppDialogLogic;
  publishAppDialogLogic: PublishAppDialogLogic;
  exportAppDialogLogic: ExportAppDialogLogic;
  releaseInfoDialogLogic: ReleaseInfoDialogLogic;
};
