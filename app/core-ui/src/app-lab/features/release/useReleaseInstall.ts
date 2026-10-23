import {
  installRelease,
  readReleaseArchive,
  readReleaseManifest,
} from '@cloud-editor-mono/domain/src/services/services-by-app/app-lab';
import {
  ImportResourceLogic,
  ImportStatus,
  ReleaseDetails,
  useI18n,
} from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { useCallback, useContext, useState } from 'react';

import { baseName } from '../../hooks/useImportResource';
import { ReleaseContext } from '../../providers/release/releaseContext';
import { sendAppLabNotification } from '../notifications';
import { releaseMessages } from './messages';
import { isReleaseArchive, releaseInfoDetails } from './releaseApp';

type ReleaseStep = Pick<
  ReturnType<ImportResourceLogic>,
  | 'status'
  | 'errorMessage'
  | 'pendingRelease'
  | 'enablePreparation'
  | 'setEnablePreparation'
  | 'confirmReleaseInstall'
  | 'cancelReleaseInstall'
>;

interface UseReleaseInstallParams {
  closeDialog: () => void;
  onInstalled: (appId: string) => void;
}

// The release step of the import-app dialog. A release is installed, not
// imported: its manifest is shown first and the user confirms before anything
// reaches the board.
export const useReleaseInstall = ({
  closeDialog,
  onInstalled,
}: UseReleaseInstallParams): {
  // Takes the picked or dropped paths when one of them is a release.
  claimPaths: (items: { path: string; isFolder: boolean }[]) => boolean;
  // Set while the dialog shows the release step.
  releaseStep?: ReleaseStep;
  reset: () => void;
} => {
  const { formatMessage } = useI18n();
  const { startPreparation } = useContext(ReleaseContext);

  const [status, setStatus] = useState<ImportStatus>();
  const [errorMessage, setErrorMessage] = useState<string>();
  const [pendingRelease, setPendingRelease] = useState<ReleaseDetails>();
  const [path, setPath] = useState<string>();
  const [enablePreparation, setEnablePreparation] = useState(true);

  const reset = useCallback((): void => {
    setStatus(undefined);
    setErrorMessage(undefined);
    setPendingRelease(undefined);
    setPath(undefined);
  }, []);

  const fail = useCallback((error: unknown): void => {
    setPendingRelease(undefined);
    setPath(undefined);
    setStatus(ImportStatus.UploadFailed);
    setErrorMessage(error instanceof Error ? error.message : String(error));
  }, []);

  const showRelease = useCallback(
    async (releasePath: string): Promise<void> => {
      setErrorMessage(undefined);
      try {
        const manifest = await readReleaseManifest(releasePath);
        setPendingRelease(releaseInfoDetails(manifest));
        setPath(releasePath);
        setEnablePreparation(true);
        setStatus(ImportStatus.ReleaseInfo);
      } catch (error) {
        fail(error);
      }
    },
    [fail],
  );

  const claimPaths = useCallback(
    (items: { path: string; isFolder: boolean }[]): boolean => {
      const releases = items.filter(
        (item) => !item.isFolder && isReleaseArchive(item.path),
      );
      if (releases.length === 0) {
        reset();
        return false;
      }
      if (items.length > 1) {
        sendAppLabNotification({
          message: formatMessage(releaseMessages.importReleaseAlone, {
            fileName: baseName(releases[0].path),
          }),
          variant: 'warning',
        });
      }
      void showRelease(releases[0].path);
      return true;
    },
    [formatMessage, reset, showRelease],
  );

  const confirmReleaseInstall = useCallback(async (): Promise<void> => {
    if (!path) return;
    setStatus(ImportStatus.Installing);
    setErrorMessage(undefined);

    try {
      const archive = await readReleaseArchive(path);
      const { id, name } = await installRelease(archive, baseName(path));
      onInstalled(id);
      reset();
      closeDialog();
      const imported = formatMessage(releaseMessages.importCompleted, {
        appName: name,
      });
      if (!enablePreparation) {
        sendAppLabNotification({ message: imported, variant: 'success' });
        return;
      }
      // With dependencies, the release is imported once they are downloaded.
      startPreparation(id, name, { successMessage: imported });
    } catch (error) {
      fail(error);
    }
  }, [
    path,
    enablePreparation,
    onInstalled,
    formatMessage,
    reset,
    closeDialog,
    startPreparation,
    fail,
  ]);

  const cancelReleaseInstall = useCallback((): void => {
    reset();
    closeDialog();
  }, [reset, closeDialog]);

  return {
    claimPaths,
    releaseStep: status
      ? {
          status,
          errorMessage,
          pendingRelease,
          enablePreparation,
          setEnablePreparation,
          confirmReleaseInstall,
          cancelReleaseInstall,
        }
      : undefined,
    reset,
  };
};
