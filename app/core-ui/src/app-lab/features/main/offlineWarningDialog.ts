import { OfflineWarningDialogLogic } from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { useCallback, useContext, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { NetworkContext } from '../../providers/network/networkContext';
import { SetupContext } from '../../providers/setup/setupContext';
import { useBoardLifecycleStore } from '../../store/boardLifecycle';
import { useNetworkSettingsDialogStore } from '../../store/networkSettingsDialog';
import { useOfflineWarningDialogStore } from '../../store/offlineWarningDialog';

// Logic contract for OfflineWarningDialog. Main passes it uninvoked; the dialog
// runs it in its own render. Its state lives in a shared store so the network
// settings dialog can read this dialog's open flag without a second copy.
export const useOfflineWarningDialogLogic =
  (): ReturnType<OfflineWarningDialogLogic> => {
    const openNetworkSettings = useNetworkSettingsDialogStore(
      (state) => state.setOpen,
    );
    const {
      open,
      setOpen,
      choiceMade,
      setChoiceMade,
      wasClosedByUser,
      setWasClosedByUser,
    } = useOfflineWarningDialogStore(
      useShallow((state) => ({
        open: state.open,
        setOpen: state.setOpen,
        choiceMade: state.choiceMade,
        setChoiceMade: state.setChoiceMade,
        wasClosedByUser: state.wasClosedByUser,
        setWasClosedByUser: state.setWasClosedByUser,
      })),
    );
    const { networkStatusChecked, isConnected, isScanning, isConnecting } =
      useContext(NetworkContext);
    const { setupCompleted, networkStepSkipped } = useContext(SetupContext);
    const { boardIsReachable } = useBoardLifecycleStore(
      useShallow((state) => ({
        boardIsReachable: state.boardIsReachable,
      })),
    );

    // Show dialog when there's a connected board, network is determined to be offline, and no scanning/connection operations
    useEffect(() => {
      const isNetworkOperationInProgress = isScanning || isConnecting;

      // Don't show modal if any blocking condition is met
      if (!setupCompleted || networkStepSkipped || choiceMade) {
        setOpen(false);
        return;
      }

      if (
        boardIsReachable &&
        networkStatusChecked &&
        !isConnected &&
        !isNetworkOperationInProgress &&
        !wasClosedByUser
      ) {
        const timeoutId = setTimeout(() => {
          setOpen(true);
        }, 10000); // Wait 10 seconds for WiFi automatic connection

        return () => clearTimeout(timeoutId);
      } else if (isConnected) {
        setOpen(false);
        setWasClosedByUser(false);
      } else if (!boardIsReachable || isNetworkOperationInProgress) {
        setOpen(false);
        setWasClosedByUser(false);
        setChoiceMade(false);
      }
    }, [
      boardIsReachable,
      networkStatusChecked,
      isConnected,
      isScanning,
      isConnecting,
      wasClosedByUser,
      setupCompleted,
      networkStepSkipped,
      choiceMade,
      setOpen,
      setWasClosedByUser,
      setChoiceMade,
    ]);

    const onContinue = useCallback(() => {
      setOpen(false);
      setWasClosedByUser(true);
      setChoiceMade(true);
    }, [setOpen, setWasClosedByUser, setChoiceMade]);

    const onNetworkSettings = useCallback(() => {
      setOpen(false);
      setWasClosedByUser(true);
      setChoiceMade(true);
      openNetworkSettings(true);
    }, [setOpen, setWasClosedByUser, setChoiceMade, openNetworkSettings]);

    const handleOnOpenChange = useCallback(
      (isOpen: boolean) => {
        // If user is closing the modal (not opening it), save their choice
        if (!isOpen && open) {
          setChoiceMade(true);
          setWasClosedByUser(true);
        }
        setOpen(isOpen);
      },
      [open, setChoiceMade, setWasClosedByUser, setOpen],
    );

    return {
      open,
      onOpenChange: handleOnOpenChange,
      onContinue,
      onNetworkSettings,
    };
  };
