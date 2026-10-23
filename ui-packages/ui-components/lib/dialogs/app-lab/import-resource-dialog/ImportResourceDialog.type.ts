import { ReleaseDetails } from '../../../components-by-app/app-lab/app-release';
import {
  ConflictType,
  OnDuplicateConflictParams,
} from '../duplicate-file-dialog/types';

export interface ImportResourceResult {
  id: string;
  name: string;
}

export enum ImportStatus {
  Idle = 'idle',
  Uploading = 'uploading',
  UploadFailed = 'upload-failed',
  // A release archive was picked: its manifest is confirmed before anything is written.
  ReleaseInfo = 'release-info',
  Installing = 'installing',
}

export type ResourceType = 'app' | 'file' | 'folder';

export type UseImportResourceProps = {
  importResourceDialogOpen: boolean;
  setImportResourceDialogOpen: (open: boolean) => void;
  setImportedResourceId: (id: string | undefined) => void;
  importResourceFromPath: (
    filePath: string,
    isFolder: boolean,
    newFileName?: string,
  ) => Promise<ImportResourceResult>;
  type: ResourceType;
  invalidateQueries: () => void;
  // Resolved by the owner of the filesystem: the file tree is listed lazily, so
  // a name already taken inside an unlisted folder is invisible here.
  checkPathConflict?: (
    toPath: string,
    nodeType: 'file' | 'folder',
  ) => Promise<{ hasDuplicate: boolean; conflictType: ConflictType }>;
  targetFolderPath?: string;
  onDuplicateConflict?: (params: OnDuplicateConflictParams) => void;
  selectResourcePath?: () => Promise<string | string[] | null>;
  // Takes the picked or dropped paths away from the import, e.g. an App release
  // that is installed instead.
  claimPaths?: (items: { path: string; isFolder: boolean }[]) => boolean;
};

export interface ImportResourceDialogProps {
  logic: ImportResourceLogic;
}

export type ImportResourceLogic = () => {
  open: boolean;
  status: ImportStatus;
  errorMessage?: string;
  onOpenChange: (open: boolean) => void;
  startImport: (remoteDir?: string) => void;
  type: ResourceType;
  // Only set while a release archive is waiting to be confirmed.
  pendingRelease?: ReleaseDetails;
  enablePreparation?: boolean;
  setEnablePreparation?: (enabled: boolean) => void;
  confirmReleaseInstall?: () => void;
  cancelReleaseInstall?: () => void;
};
