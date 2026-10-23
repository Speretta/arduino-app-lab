import { PreparationRequiredDialogLogic } from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { useCallback, useContext } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { ReleaseContext } from '../../providers/release/releaseContext';
import { usePreparationDialogStore } from '../../store/preparationDialog';

export const usePreparationRequiredDialogLogic =
  (): PreparationRequiredDialogLogic => {
    const { startPreparation } = useContext(ReleaseContext);
    const { open, appId, appName, onPrepared, setOpen } =
      usePreparationDialogStore(
        useShallow((state) => ({
          open: state.open,
          appId: state.appId,
          appName: state.appName,
          onPrepared: state.onPrepared,
          setOpen: state.setOpen,
        })),
      );

    const onStartPreparation = useCallback((): void => {
      if (appId) {
        startPreparation(appId, appName ?? '', { onPrepared });
      }
      setOpen(false);
    }, [appId, appName, onPrepared, startPreparation, setOpen]);

    return () => ({ open, onOpenChange: setOpen, onStartPreparation });
  };
