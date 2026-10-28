import { openBoardTerminal } from '@cloud-editor-mono/domain/src/services/services-by-app/app-lab';
import { snackbar } from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { useState } from 'react';

export interface UseTerminal {
  onOpenTerminal: () => Promise<void>;
  terminalError: string | null;
}

export const useTerminal = (): UseTerminal => {
  const [terminalError, setTerminalError] = useState<string | null>(null);

  const onOpenTerminal = async (): Promise<void> => {
    try {
      setTerminalError(null);
      const result = await openBoardTerminal();
      // The terminal selected in the settings could not be started and another
      // one was used instead: the user has to know it.
      if (result?.warning) {
        snackbar({
          message: result.warning,
          variant: 'warning',
        });
      }
    } catch (e) {
      const message = (e as Error).message;
      setTerminalError(message);
      snackbar({
        message,
        variant: 'error',
      });
      setTimeout(() => setTerminalError(null), 6000);
    }
  };

  return { onOpenTerminal, terminalError };
};
