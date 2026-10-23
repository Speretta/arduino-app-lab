import { FileId } from '@cloud-editor-mono/domain/src/services/services-by-app/shared';
import { AppBrickListItem } from '@cloud-editor-mono/infrastructure';
import { SelectableFileData } from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { Subject } from 'rxjs';

import {
  OpenFilesStoreItem,
  OpenFilesStorePatch,
} from '../../../../../common/hooks/files';

export type UseEditorFilesParams = {
  storeEntityId?: string;
  // undefined while it is still being resolved, null once resolved to nothing.
  defaultFilePath?: string | null;
  // A board that never answered must not look like an app with no tabs.
  appDirListed: boolean;
  appBricks?: AppBrickListItem[];
  getUnsavedFilesSubject: () => Subject<Set<FileId>>;
};

export type UseEditorFilesReturn = {
  // Full catalogue of resolvable files (project + bricks, later +
  // externals). Stable per-id identities — see `useEditorFileMeta`.
  editorFiles: SelectableFileData[];
  openFiles: SelectableFileData[];
  // Raw open-tab ids for panel A. Unlike `openFiles` (which is filtered through
  // the meta catalogue), this is pure state — it does not change when the file
  // tree refetches, making it the reliable source for reconciling tabs against
  // external filesystem events.
  openFileIds: string[];
  selectedFile: SelectableFileData | undefined;
  previewFileId?: string;
  openFilesStore?: OpenFilesStoreItem | null;
  selectFile: (params: {
    fileId?: string;
    openAtIndex?: number;
    isPreview?: boolean;
  }) => void;
  closeFile: (fileId: string) => void;
  updateOpenFile: (prevFileId: string, nextFileId: string) => void;
  updateOpenFilesOrder: (fileIds: string[], draggedFileId?: string) => void;
  onAppRename: (newAppId: string) => Promise<void>;
  storeSplitState: (patch: OpenFilesStorePatch) => Promise<void>;
};
