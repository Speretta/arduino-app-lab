import { Board } from '../../../components-by-app/app-lab';

export enum UpdaterStatus {
  None = 'None',
  Checking = 'Checking',
  CheckingFailed = 'CheckingFailed',
  AlreadyUpToDate = 'AlreadyUpToDate',
  UpdateAvailable = 'UpdateAvailable',
  UpdatingBoard = 'UpdatingBoard',
  UpdatingApp = 'UpdatingApp',
  UpdateFailed = 'UpdateFailed',
  UpdateComplete = 'UpdateComplete',
  Restarting = 'Restarting',
  Skipped = 'Skipped',
}

export type BoardUpdateDialogLogic = () => {
  board?: Board;
  open: boolean;
  isBoard: boolean | undefined;
  status: UpdaterStatus;
  title?: string;
  newAppVersion?: string;
  releaseNotes?: { content: string; image: string };
  boardUpdateSucceeded?: boolean;
  appUpdateSucceeded?: boolean;
  boardUpdates?: Array<{ name: string; toVersion: string }> | null;
  boardLogs?: string[];
  // 0-100. Undefined while the update reports no progress yet: the bar stays
  // indeterminate and no percentage is shown.
  boardUpdateProgress?: number;
  startUpdate: () => void;
  reloadApp: () => void;
  openFlasherTool: () => Promise<void>;
  openArduinoSupport: () => Promise<void>;
  skipUpdate: () => void;
  changeNetwork: () => void;
  bypassSkipUpdate: boolean;
};

export type BoardUpdateDialogProps = { logic: BoardUpdateDialogLogic };
