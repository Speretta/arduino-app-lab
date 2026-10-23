import {
  CloudConnectorErrorDialog,
  CloudConnectorRequiredDialog,
} from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { useMemo } from 'react';

import { CloudConnectorContext } from './cloudConnectorContext';
import { useCloudConnector } from './cloudConnectorContextProvider.logic';

interface CloudConnectorContextProviderProps {
  children?: React.ReactNode;
}

const CloudConnectorContextProvider: React.FC<
  CloudConnectorContextProviderProps
> = (props: CloudConnectorContextProviderProps) => {
  const { children } = props;
  const {
    errorDialogLogic,
    requiredDialogLogic,
    status,
    isConnecting,
    isDisconnecting,
    startProvisioning,
    removeProvisioning,
    showRequiredDialog,
  } = useCloudConnector();

  // Memoized so a dialog-only state change does not re-render every context
  // consumer under this provider.
  const contextValue = useMemo(
    () => ({
      status,
      isConnecting,
      isDisconnecting,
      startProvisioning,
      removeProvisioning,
      showRequiredDialog,
    }),
    [
      status,
      isConnecting,
      isDisconnecting,
      startProvisioning,
      removeProvisioning,
      showRequiredDialog,
    ],
  );

  return (
    <CloudConnectorContext.Provider value={contextValue}>
      <CloudConnectorErrorDialog logic={errorDialogLogic} />
      <CloudConnectorRequiredDialog logic={requiredDialogLogic} />
      {children}
    </CloudConnectorContext.Provider>
  );
};

export default CloudConnectorContextProvider;
