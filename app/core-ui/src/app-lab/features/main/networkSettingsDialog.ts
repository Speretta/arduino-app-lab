import { onAgentWifiRequest } from '@cloud-editor-mono/domain/src/services/services-by-app/app-lab';
import {
  NetworkCredentials,
  NetworkSettingsDialogLogic,
  SecurityProtocols,
} from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { useContext, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { NetworkContext } from '../../providers/network/networkContext';
import { useNetworkSettingsDialogStore } from '../../store/networkSettingsDialog';
import { useOfflineWarningDialogStore } from '../../store/offlineWarningDialog';

// Logic contract for NetworkSettingsDialog. Main passes it uninvoked; the dialog
// runs it in its own render and owns the state below. Its open state lives in a
// shared store because the offline warning, the settings screen and the cloud
// connector flow all open this one dialog.
export const useNetworkSettingsDialogLogic =
  (): ReturnType<NetworkSettingsDialogLogic> => {
    const { open, setOpen } = useNetworkSettingsDialogStore(
      useShallow((state) => ({ open: state.open, setOpen: state.setOpen })),
    );
    // The network the agent proposed via wifi_connect: it can name a network, never supply the password.
    const [agentNetwork, setAgentNetwork] = useState<string>();
    // Network seeds its form from this draft at mount: it's how the SSID reaches the read-only name field, since selectedNetwork only picks the connect view.
    const [draftNetworkCredentials, setDraftNetworkCredentials] =
      useState<NetworkCredentials>();
    const networkContext = useContext(NetworkContext);
    const { setManualNetworkSetup, setSelectedNetwork, setScanningIsEnabled } =
      networkContext;
    const offlineWarningOpen = useOfflineWarningDialogStore(
      (state) => state.open,
    );

    // The offline warning takes priority: close this dialog when it opens.
    useEffect(() => {
      if (offlineWarningOpen) {
        setOpen(false);
      }
    }, [offlineWarningOpen, setOpen]);

    useEffect(() => {
      setManualNetworkSetup(false);
      setSelectedNetwork(undefined);
      setScanningIsEnabled(open);
    }, [open, setManualNetworkSetup, setSelectedNetwork, setScanningIsEnabled]);

    useEffect(
      () =>
        onAgentWifiRequest((ssid) => {
          // Set the draft before opening: the dialog reads it once, as it mounts.
          setDraftNetworkCredentials({
            name: ssid,
            password: '',
            security: SecurityProtocols.WPA2,
          });
          setAgentNetwork(ssid);
          setOpen(true);
        }),
      [setOpen],
    );

    // Declared after the reset above, which clears the selection on every open change, so the agent's pick is re-applied in the same commit.
    useEffect(() => {
      if (!open) {
        // A later manual open starts clean, with no network pre-filled.
        setAgentNetwork(undefined);
        setDraftNetworkCredentials(undefined);
        return;
      }
      if (agentNetwork) {
        setSelectedNetwork(agentNetwork);
      }
    }, [open, agentNetwork, setSelectedNetwork]);

    useEffect(() => {
      if (networkContext.connectRequestIsSuccess) {
        setOpen(false);
      }
    }, [networkContext.connectRequestIsSuccess, setOpen]);

    return {
      ...networkContext,
      open,
      onOpenChange: setOpen,
      // Also handed back so picking another network from the list keeps the draft in step (Network calls the setter).
      draftNetworkCredentials,
      setDraftNetworkCredentials,
    };
  };
