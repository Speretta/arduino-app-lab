import { AddSketchLibraryDialogLogic } from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { useCallback, useEffect, useState } from 'react';

import { useBoardLifecycleStore } from '../../../../store/boardLifecycle';
import { UseSketchLibraries } from './useSketchLibraries';

interface UseAddSketchLibraryDialogParams {
  libraries?: UseSketchLibraries['libraries'];
  librarySearchIsLoading: UseSketchLibraries['librarySearchIsLoading'];
  librarySearchError: UseSketchLibraries['librarySearchError'];
  retryLibrarySearch: UseSketchLibraries['retryLibrarySearch'];
  searchSketchLibraries: UseSketchLibraries['searchSketchLibraries'];
  appLibrariesById: UseSketchLibraries['appLibrariesById'];
  installingLibraryId?: UseSketchLibraries['installingLibraryId'];
  addSketchLibrary: UseSketchLibraries['addSketchLibrary'];
  deletingLibraryId?: UseSketchLibraries['deletingLibraryId'];
  deleteSketchLibrary: UseSketchLibraries['deleteSketchLibrary'];
  addSketchLibraryError?: UseSketchLibraries['addSketchLibraryError'];
  openExternalLink: (url: string) => void;
  isBoard?: boolean;
}

export type UseAddSketchLibraryDialogLogic = () => {
  open: boolean;
  onOpenChange: (value: boolean) => void;
} & UseAddSketchLibraryDialogParams;

export type UseAddSketchLibraryDialog = (
  params: UseAddSketchLibraryDialogParams & {
    // No sketch, or a board without internet: every entry point is refused.
    blocked: boolean;
    // An open dialog closes only when the sketch is known to be gone. One
    // failed internet poll or folder listing must not close it; a failed
    // search shows its own error inside the dialog.
    closeOpenDialog: boolean;
  },
) => {
  openDialog: () => void;
  dialogLogic: UseAddSketchLibraryDialogLogic;
};

export const useAddSketchLibraryDialog: UseAddSketchLibraryDialog = ({
  blocked,
  closeOpenDialog,
  ...params
}) => {
  const [open, setOpen] = useState(false);
  const openDialog = useCallback(() => {
    if (!blocked) setOpen(true);
  }, [blocked]);
  const onOpenChange = useCallback(
    (value: boolean): void =>
      setOpen((current) => value && (current || !blocked)),
    [blocked],
  );

  useEffect(() => {
    if (closeOpenDialog) setOpen(false);
  }, [closeOpenDialog]);

  const selectedBoard = useBoardLifecycleStore(
    (state) => state.selectedConnectedBoard,
  );

  const useDialogLogic: AddSketchLibraryDialogLogic = () => ({
    open,
    onOpenChange,
    board: selectedBoard,
    ...params,
  });
  const dialogLogic = useCallback(useDialogLogic, [
    open,
    onOpenChange,
    params,
    selectedBoard,
  ]);

  return {
    openDialog,
    dialogLogic,
  };
};
