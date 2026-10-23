import {
  cloneApp,
  decodeBase64ToString,
  deleteApp,
  exportApp,
  getAppDetail,
  getApps,
  getConfig,
  onWatcherRefresh,
  unwatchAppsDir,
  updateAppDetail,
  watchAppsDir,
} from '@cloud-editor-mono/domain/src/services/services-by-app/app-lab';
import { AppDetailedInfo, AppInfo } from '@cloud-editor-mono/infrastructure';
import {
  AppsSection,
  CreateAppDialogLogic,
  DeleteAppDialogLogic,
  ExportAppDialogLogic,
  ReleaseInfoDialogLogic,
  RenameAppDialogLogic,
  useI18n,
} from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { queryClient } from '../../../../common/providers/data-fetching/QueryProvider';
import { BoardScopedQuery } from '../../../boardScopedQuery';
import { removeOpenFilesForApp } from '../../../services/openFilesStore';
import { useBoardLifecycleStore } from '../../../store/boardLifecycle';
import { useCreateAppDialogStore } from '../../../store/createAppDialog';
import { useImportAppDialogStore } from '../../../store/importAppDialog';
import { getBoardCacheId } from '../../../utils/board';
import { sendAppLabNotification } from '../../notifications';
import { MY_APPS_FILTER, releaseInfoDetails } from '../../release/releaseApp';
import { useCreateReleaseTrigger } from '../../release/releaseDialogs.logic';
import { notifyDefaultAppSet } from '../default-app/notifyDefaultAppSet';
import { UseAppListLogic } from './appList.type';
import { appListMessages } from './messages';

export const useAppListLogic = function (
  section: AppsSection,
  breadcrumbId?: string,
): UseAppListLogic {
  const navigate = useNavigate();
  const { formatMessage } = useI18n();

  const [deleteAppDialogOpen, setDeleteAppDialogOpen] = useState(false);
  const [duplicateAppDialogOpen, setDuplicateAppDialogOpen] = useState(false);
  const [renameAppDialogOpen, setRenameAppDialogOpen] = useState(false);
  const [exportAppDialogOpen, setExportAppDialogOpen] = useState(false);
  const [releaseInfoDialogOpen, setReleaseInfoDialogOpen] = useState(false);
  const [selectedApp, setSelectedApp] = useState<AppInfo | null>(null);

  const boardIsReachable = useBoardLifecycleStore(
    (state) => state.boardIsReachable,
  );
  const boardSerial = useBoardLifecycleStore(
    (state) => state.selectedConnectedBoard?.serial,
  );
  const connectedBoardCacheId = useBoardLifecycleStore((state) =>
    getBoardCacheId(state.selectedConnectedBoard),
  );

  const { data: apps, isLoading: getAppsLoading } = useQuery({
    queryKey: [BoardScopedQuery.LIST_MY_APPS, section],

    queryFn: () =>
      getApps({
        query: { filter: section === 'my-apps' ? MY_APPS_FILTER : 'examples' },
      }),
    enabled: boardIsReachable,
  });

  // Filter out examples starting with excludedPrefixes
  const filteredApps = useMemo(() => {
    if (section !== 'examples' || !apps) return apps;

    const excludedPrefixes = ['bricks/', 'core-and-foundational/'];

    return apps.filter((app) => {
      if (!app.id) return true;

      const path = decodeBase64ToString(app.id).replace(/^examples:/, '');
      return !excludedPrefixes.some((prefix) => path.startsWith(prefix));
    });
  }, [apps, section]);

  // Reads the unfiltered list: which app is default is independent of what the
  // list chooses to show, and a filtered-out default would invert the toggle.
  const defaultApp = useMemo(() => apps?.find((app) => app.default), [apps]);

  // Watch the apps root (ArduinoApps) while the my-apps list is open, so apps
  // added/removed/renamed outside App Lab show up without a manual refresh.
  const { data: appConfig } = useQuery({
    queryKey: [BoardScopedQuery.APP_CONFIG, boardSerial],
    queryFn: () => getConfig(),
    enabled: boardIsReachable && section === 'my-apps',
  });
  const appsRootDir = appConfig?.directories?.apps;

  // Watch the apps root while the my-apps list is open: a spec-correct rename
  // moves the folder, so add/remove/rename under ArduinoApps (the `apps` kind)
  // is all the list needs.
  useEffect(() => {
    if (section !== 'my-apps' || !appsRootDir) return;

    watchAppsDir(appsRootDir).catch((e) =>
      console.error('[file-watch] watch apps dir failed', e),
    );
    const unsubscribe = onWatcherRefresh((event) => {
      if (event.kind === 'apps') {
        queryClient.invalidateQueries({
          queryKey: [BoardScopedQuery.LIST_MY_APPS],
        });
      }
    });

    return () => {
      unsubscribe();
      unwatchAppsDir(appsRootDir).catch((e) =>
        console.error('[file-watch] unwatch apps dir failed', e),
      );
    };
    // connectedBoardCacheId: the backend drops all watches on a board switch,
    // and appsRootDir is board-independent, so re-run to re-establish the watch
    // against the newly connected board.
  }, [section, appsRootDir, connectedBoardCacheId]);

  // the create-app dialog is owned by main; open it through the shared store
  const openCreateAppDialog = useCreateAppDialogStore((state) => state.setOpen);

  const handleOpenCreateAppDialog = useCallback(() => {
    openCreateAppDialog(true);
  }, [openCreateAppDialog]);

  // the import-app dialog is owned by main too; the shared store carries the
  // open-state and the imported id used to highlight the fresh card below
  const openImportAppDialog = useImportAppDialogStore((state) => state.setOpen);
  const importedAppId = useImportAppDialogStore((state) => state.importedAppId);
  const setImportedAppId = useImportAppDialogStore(
    (state) => state.setImportedAppId,
  );

  const handleOpenImportAppDialog = useCallback(() => {
    openImportAppDialog(true);
  }, [openImportAppDialog]);

  const resetImportedAppId = useCallback(() => {
    setImportedAppId(undefined); // Reset importedAppId to prevent ripple retrigger
  }, [setImportedAppId]);

  const createAppActionHandler = useCallback(
    (dialogSetter: (open: boolean) => void, action?: () => void) =>
      (app: AppInfo) => {
        setSelectedApp(app);
        dialogSetter(true);
        resetImportedAppId();
        action?.();
      },
    [resetImportedAppId],
  );

  const handleRename = useCallback(
    (app: AppInfo) => createAppActionHandler(setRenameAppDialogOpen)(app),
    [createAppActionHandler],
  );

  const handleDuplicate = useCallback(
    (app: AppInfo) => createAppActionHandler(setDuplicateAppDialogOpen)(app),
    [createAppActionHandler],
  );

  const handleDelete = useCallback(
    (app: AppInfo) => createAppActionHandler(setDeleteAppDialogOpen)(app),
    [createAppActionHandler],
  );

  const handleExport = useCallback(
    (app: AppInfo) => createAppActionHandler(setExportAppDialogOpen)(app),
    [createAppActionHandler],
  );

  const { mutateAsync: handleSetAsDefault } = useMutation({
    mutationFn: async (app: AppInfo) => {
      if (!app.id) return false;
      const isDefault = defaultApp?.id === app.id;
      const result = await updateAppDetail(app.id, { default: !isDefault });
      if (result && isDefault) {
        sendAppLabNotification({
          message: formatMessage(appListMessages.removedAsDefault, {
            appName: app.name,
          }),
          variant: 'success',
        });
      } else if (result) {
        notifyDefaultAppSet(
          { id: app.id, name: app.name ?? '' },
          formatMessage,
        );
      }
      return result !== undefined;
    },
    onSuccess: () => {
      // Prefix match: the detail toggle reads `default` from the unfiltered status list.
      queryClient.invalidateQueries({
        queryKey: [BoardScopedQuery.LIST_MY_APPS],
      });
    },
  });

  const { openCreateRelease, disabledReason: createReleaseDisabledReason } =
    useCreateReleaseTrigger();

  const handleReleaseInfo = useCallback(
    (app: AppInfo) => createAppActionHandler(setReleaseInfoDialogOpen)(app),
    [createAppActionHandler],
  );

  const appActions = useCallback(
    () => ({
      onRename: handleRename,
      onDuplicate: handleDuplicate,
      onExport: handleExport,
      onCreateRelease: openCreateRelease,
      createReleaseDisabledReason: (app: AppInfo): string | undefined =>
        createReleaseDisabledReason(app.id),
      onReleaseInfo: handleReleaseInfo,
      onSetAsDefault: handleSetAsDefault,
      onDelete: handleDelete,
    }),
    [
      handleRename,
      handleDuplicate,
      handleExport,
      openCreateRelease,
      createReleaseDisabledReason,
      handleReleaseInfo,
      handleSetAsDefault,
      handleDelete,
    ],
  );

  const handleAppClick = useCallback(
    (appId: string, e?: React.MouseEvent) => {
      if (e) {
        const target = e.target as HTMLElement;
        const isContextMenu =
          target.closest('[data-radix-context-menu-content]') !== null;
        if (isContextMenu) return;
      }

      // Inspirations lists example apps and shares the /examples/$appId detail
      // route; carry the origin so the breadcrumb goes back to Inspirations.
      if (breadcrumbId === 'inspirations') {
        navigate({
          to: '/examples/$appId',
          params: { appId },
          search: { from: 'inspirations' },
        });
        return;
      }

      navigate({
        to: `/${section}/$appId`,
        params: { appId },
      });
    },
    [navigate, section, breadcrumbId],
  );

  const { mutateAsync: handleDeleteApp } = useMutation({
    mutationFn: async (): Promise<boolean> => {
      if (!selectedApp?.id) return false;
      const result = await deleteApp(selectedApp.id);
      if (result) {
        await removeOpenFilesForApp(selectedApp.id, boardSerial);
        sendAppLabNotification({
          message: formatMessage(appListMessages.successfullyDeletedApp),
          variant: 'success',
          duration: 3000,
        });
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [BoardScopedQuery.LIST_MY_APPS, section],
      });
    },
  });

  const deleteAppDialogLogic = useCallback(
    (): ReturnType<DeleteAppDialogLogic> => ({
      open: deleteAppDialogOpen,
      appName: selectedApp
        ? [selectedApp.icon, selectedApp.name].join(' ')
        : '',
      confirmAction: handleDeleteApp,
      onOpenChange: setDeleteAppDialogOpen,
    }),
    [deleteAppDialogOpen, selectedApp, handleDeleteApp],
  );

  const { mutateAsync: handleCloneApp } = useMutation({
    mutationFn: async (request: {
      icon?: string;
      name: string;
    }): Promise<boolean> => {
      if (!selectedApp?.id) return false;
      const result = await cloneApp(selectedApp.id, request);
      if (result) {
        navigate({ to: `/my-apps/${result}` });
      }
      return result !== undefined;
    },
  });

  const duplicateAppDialogLogic = useCallback(
    (): ReturnType<CreateAppDialogLogic> => ({
      open: duplicateAppDialogOpen,
      app: selectedApp as AppDetailedInfo | undefined,
      confirmAction: handleCloneApp,
      onOpenChange: setDuplicateAppDialogOpen,
      sendNotification: sendAppLabNotification,
    }),
    [duplicateAppDialogOpen, selectedApp, handleCloneApp],
  );

  const { mutateAsync: handleRenameApp } = useMutation({
    mutationFn: async (request: {
      icon?: string;
      name: string;
    }): Promise<boolean> => {
      if (!selectedApp?.id) return false;

      const body: {
        icon?: string;
        name?: string;
      } = {
        ...(request.icon !== undefined &&
          request.icon !== selectedApp.icon && { icon: request.icon }),
        ...(request.name !== selectedApp.name && { name: request.name }),
      };

      if (Object.keys(body).length === 0) return true;

      const result = await updateAppDetail(selectedApp.id, body);
      return result !== undefined;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [BoardScopedQuery.LIST_MY_APPS, section],
      });
    },
  });

  const renameAppDialogLogic = useCallback(
    (): ReturnType<RenameAppDialogLogic> => ({
      open: renameAppDialogOpen,
      app: selectedApp as AppDetailedInfo | undefined,
      confirmAction: handleRenameApp,
      onOpenChange: setRenameAppDialogOpen,
      sendNotification: sendAppLabNotification,
    }),
    [renameAppDialogOpen, selectedApp, handleRenameApp],
  );

  const {
    mutate: onExport,
    isPending: exportLoading,
    error: exportError,
    reset: exportReset,
  } = useMutation({
    mutationFn: async (includeData: boolean) => {
      if (!selectedApp?.id || !selectedApp.name) return false;

      return exportApp(selectedApp.id, selectedApp.name, includeData);
    },
    onSuccess: (result) => {
      if (result) {
        setExportAppDialogOpen(false);
        sendAppLabNotification({
          message: formatMessage(appListMessages.successfullyExportedApp, {
            appName: selectedApp?.name,
          }),
          variant: 'success',
        });
      }
    },
  });

  const exportAppDialogLogic = useCallback(
    (): ReturnType<ExportAppDialogLogic> => ({
      open: exportAppDialogOpen,
      appName: selectedApp
        ? [selectedApp.icon, selectedApp.name].join(' ')
        : '',
      onExport,
      onOpenChange: setExportAppDialogOpen,
      isLoading: exportLoading,
      error: exportError,
      reset: exportReset,
    }),
    [
      exportAppDialogOpen,
      selectedApp,
      onExport,
      exportLoading,
      exportError,
      exportReset,
    ],
  );

  // The app list has no release note: the dialog reads the app detail.
  const { data: releaseInfoApp } = useQuery({
    queryKey: [BoardScopedQuery.LIST_MY_APPS, selectedApp?.id],
    queryFn: () => getAppDetail(selectedApp?.id ?? ''),
    enabled: releaseInfoDialogOpen && !!selectedApp?.id,
  });

  const releaseInfoDialogLogic = useCallback(
    (): ReturnType<ReleaseInfoDialogLogic> => ({
      open: releaseInfoDialogOpen,
      release: selectedApp
        ? releaseInfoDetails({ ...selectedApp, ...releaseInfoApp })
        : undefined,
      onOpenChange: setReleaseInfoDialogOpen,
    }),
    [releaseInfoDialogOpen, selectedApp, releaseInfoApp],
  );

  return {
    apps: filteredApps || [],
    isLoading: getAppsLoading,
    sendNotification: sendAppLabNotification,
    openCreateAppDialog: handleOpenCreateAppDialog,
    openImportAppDialog: handleOpenImportAppDialog,
    importedAppId,
    resetImportedAppId,
    appActions: appActions(),
    deleteAppDialogLogic,
    duplicateAppDialogLogic,
    renameAppDialogLogic,
    exportAppDialogLogic,
    releaseInfoDialogLogic,
    defaultApp,
    handleAppClick,
  };
};
