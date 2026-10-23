import {
  importAppFromPath,
  selectAppPathToImport,
} from '@cloud-editor-mono/domain/src/services/services-by-app/app-lab';
import { ImportResourceLogic } from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { useCallback } from 'react';

import { queryClient } from '../../../../common/providers/data-fetching/QueryProvider';
import { BoardScopedQuery } from '../../../boardScopedQuery';
import { useImportResource } from '../../../hooks/useImportResource';
import { useReleaseInstall } from '../../release/useReleaseInstall';

const invalidateApps = (): void => {
  queryClient.invalidateQueries({
    queryKey: [BoardScopedQuery.LIST_MY_APPS],
  });
};

export const useImportAppDialogLogic = (
  importAppDialogOpen: boolean,
  setImportAppDialogOpen: (open: boolean) => void,
  setImportedAppId: (id: string | undefined) => void,
): ImportResourceLogic => {
  const closeDialog = useCallback(
    () => setImportAppDialogOpen(false),
    [setImportAppDialogOpen],
  );
  const onInstalled = useCallback(
    (appId: string) => {
      setImportedAppId(appId);
      invalidateApps();
    },
    [setImportedAppId],
  );
  const { claimPaths, releaseStep, reset } = useReleaseInstall({
    closeDialog,
    onInstalled,
  });

  const importLogic = useImportResource({
    importResourceDialogOpen: importAppDialogOpen,
    setImportResourceDialogOpen: setImportAppDialogOpen,
    setImportedResourceId: setImportedAppId,
    importResourceFromPath: importAppFromPath,
    selectResourcePath: selectAppPathToImport,
    type: 'app',
    invalidateQueries: invalidateApps,
    claimPaths,
  });

  return () => {
    const logic = importLogic();
    return {
      ...logic,
      ...releaseStep,
      onOpenChange: (open: boolean): void => {
        reset();
        logic.onOpenChange(open);
      },
    };
  };
};
