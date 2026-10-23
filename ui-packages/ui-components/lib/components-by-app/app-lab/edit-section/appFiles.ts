import { getBrickDetails } from '@cloud-editor-mono/domain/src/services/services-by-app/app-lab';
import {
  AppBrickListItem,
  BrickCreateUpdateRequest,
  BrickListItem,
} from '@cloud-editor-mono/infrastructure';
import {
  AddAppBrickDialogLogic,
  BrickDetailLogic,
  ConfigureAppBrickDialogLogic,
  DeleteAppBrickDialogLogic,
  useI18n,
} from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { useCallback, useState } from 'react';

import { CustomBrickDialogLogic } from '../../../dialogs/app-lab/add-app-brick-dialog/sub-components/CustomBrickDialog';
import { messages } from '../app-detail/messages';
import { SendAppLabNotification } from './appLabEditSection.type';

interface UseAppFilesSectionLogicParams {
  appId: string;
  appBricks: AppBrickListItem[] | undefined;
  bricks: BrickListItem[] | undefined;
  openExternalLink: (url: string) => void;
  brickDetailLogic: BrickDetailLogic;
  configureAppBrickDialogLogic: ConfigureAppBrickDialogLogic;
  addAppCustomBrick: (
    appId: string,
    params: {
      name: string;
      description?: string;
    },
  ) => Promise<{ id: string } | undefined>;
  sendAppLabNotification: SendAppLabNotification;

  addAppBrick(
    brickId: string,
    params?: BrickCreateUpdateRequest,
    isCustom?: boolean,
  ): Promise<boolean>;

  deleteAppBrick(brickId: string): Promise<boolean>;

  updateAppBrick(
    brickId: string,
    params: BrickCreateUpdateRequest,
  ): Promise<boolean>;

  renameAppCustomBrick(
    brickId: string,
    params: { name: string },
  ): Promise<boolean>;
}

type UseAppFilesSectionLogic = (params: UseAppFilesSectionLogicParams) => {
  addAppBrickDialogLogic: AddAppBrickDialogLogic;
  openAddAppBrickDialog: () => void;
  openCreateAppBrickDialog: () => void;
  deleteAppBrickDialogLogic: DeleteAppBrickDialogLogic;
  openDeleteAppBrickDialog: (brick: AppBrickListItem) => void;
  renameAppBrickDialogLogic: CustomBrickDialogLogic;
  openRenameAppBrickDialog: (brick: AppBrickListItem) => void;
};

// A new [] on every render would re-run the add dialog's selection effect each render.
const NO_BRICKS: BrickListItem[] = [];

export const useAppFilesSectionLogic: UseAppFilesSectionLogic = function (
  params: UseAppFilesSectionLogicParams,
): ReturnType<UseAppFilesSectionLogic> {
  const {
    appId,
    appBricks,
    bricks,
    addAppBrick,
    deleteAppBrick,
    addAppCustomBrick,
    configureAppBrickDialogLogic,
    brickDetailLogic,
    renameAppCustomBrick,
    openExternalLink,
    sendAppLabNotification,
  } = params;

  const [addAppBrickDialogOpen, setAddAppBrickDialogOpen] = useState(false);
  const [deleteAppBrickDialogOpen, setDeleteAppBrickDialogOpen] =
    useState(false);
  const [deletingAppBrick, setDeletingAppBrick] =
    useState<AppBrickListItem | null>(null);
  const [createAppBrickDialogOpen, setCreateAppAppBrickDialogOpen] =
    useState(false);
  const [renameAppBrickDialogOpen, setRenameAppAppBrickDialogOpen] =
    useState(false);
  const [renamingAppBrick, setRenamingAppBrick] =
    useState<AppBrickListItem | null>(null);

  const { formatMessage } = useI18n();

  const useCreateAppBrickDialogLogic =
    (): ReturnType<CustomBrickDialogLogic> => {
      return {
        open: createAppBrickDialogOpen,
        onOpenChange: setCreateAppAppBrickDialogOpen,
        confirmAction: async (name): Promise<boolean> => {
          if (!createAppBrickDialogOpen) return Promise.resolve(false);
          const trimmedName = name.trim();

          // Check if a brick with this name already exists
          const brickExists = appBricks?.some(
            (brick) => brick.name?.toLowerCase() === trimmedName.toLowerCase(),
          );

          if (brickExists) {
            sendAppLabNotification({
              message: formatMessage(messages.failedAddBrick),
              variant: 'warning',
            });
            return Promise.resolve(false);
          }

          const result = await addAppCustomBrick(appId, {
            name: trimmedName,
            description: trimmedName,
          });
          setAddAppBrickDialogOpen(false);
          if (!result) {
            setCreateAppAppBrickDialogOpen(false);
          }
          return result
            ? addAppBrick(result.id, undefined, true)
            : Promise.resolve(false);
        },
      };
    };

  const createAppBrickDialogLogic = useCallback(useCreateAppBrickDialogLogic, [
    createAppBrickDialogOpen,
    addAppCustomBrick,
    appId,
    addAppBrick,
    appBricks,
    formatMessage,
    sendAppLabNotification,
  ]);

  const openCreateAppBrickDialog = useCallback(() => {
    setCreateAppAppBrickDialogOpen(true);
  }, []);

  const useAddAppBrickDialogLogic = (): ReturnType<AddAppBrickDialogLogic> => {
    return {
      open: addAppBrickDialogOpen,
      appId,
      appBricks,
      bricks: bricks ?? NO_BRICKS,
      onOpenChange: setAddAppBrickDialogOpen,
      brickDetailLogic,
      configureDialogLogic: configureAppBrickDialogLogic,
      loadBrickDetails: getBrickDetails,
      confirmAddAppBrick: (
        brickId: string,
        modelId?: string,
      ): Promise<boolean> => {
        return addAppBrick(brickId, modelId ? { model: modelId } : undefined);
      },
      openCreateAppBrickDialog,
      createAppBrickDialogLogic,
      createAppBrickDialogOpen,
      onOpenExternal: openExternalLink,
    };
  };
  const addAppBrickDialogLogic = useCallback(useAddAppBrickDialogLogic, [
    addAppBrickDialogOpen,
    appId,
    appBricks,
    bricks,
    brickDetailLogic,
    configureAppBrickDialogLogic,
    openCreateAppBrickDialog,
    createAppBrickDialogLogic,
    createAppBrickDialogOpen,
    addAppBrick,
    openExternalLink,
  ]);

  const openAddAppBrickDialog = useCallback(() => {
    setAddAppBrickDialogOpen(true);
  }, []);

  const useDeleteAppBrickDialogLogic =
    (): ReturnType<DeleteAppBrickDialogLogic> => {
      return {
        brick: deletingAppBrick,
        open: deleteAppBrickDialogOpen,
        onOpenChange: setDeleteAppBrickDialogOpen,
        confirmAction: (brickId): Promise<boolean> => {
          if (!deleteAppBrickDialogOpen) return Promise.resolve(false);
          return deleteAppBrick(brickId);
        },
      };
    };

  const deleteAppBrickDialogLogic = useCallback(useDeleteAppBrickDialogLogic, [
    deletingAppBrick,
    deleteAppBrickDialogOpen,
    setDeleteAppBrickDialogOpen,
    deleteAppBrick,
  ]);

  const openDeleteAppBrickDialog = useCallback((brick: AppBrickListItem) => {
    setDeletingAppBrick(brick);
    setDeleteAppBrickDialogOpen(true);
  }, []);

  const useRenameAppBrickDialogLogic =
    (): ReturnType<CustomBrickDialogLogic> => {
      return {
        open: renameAppBrickDialogOpen,
        onOpenChange: setRenameAppAppBrickDialogOpen,
        confirmAction: (name, brickId): Promise<boolean> => {
          if (!renameAppBrickDialogOpen) return Promise.resolve(false);
          return renameAppCustomBrick(brickId ?? '', { name });
        },
        isRename: true,
        brick: renamingAppBrick,
      };
    };

  const renameAppBrickDialogLogic = useCallback(useRenameAppBrickDialogLogic, [
    renameAppBrickDialogOpen,
    renamingAppBrick,
    renameAppCustomBrick,
  ]);

  const openRenameAppBrickDialog = useCallback((brick: AppBrickListItem) => {
    setRenamingAppBrick(brick);
    setRenameAppAppBrickDialogOpen(true);
  }, []);

  return {
    addAppBrickDialogLogic,
    openAddAppBrickDialog,
    openCreateAppBrickDialog,
    deleteAppBrickDialogLogic,
    openDeleteAppBrickDialog,
    renameAppBrickDialogLogic,
    openRenameAppBrickDialog,
  };
};
