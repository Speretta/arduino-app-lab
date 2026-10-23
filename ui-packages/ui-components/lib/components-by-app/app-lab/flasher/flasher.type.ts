import { FlashEvent, OSImageRelease } from '@cloud-editor-mono/infrastructure';
import { ReactNode } from 'react';

export type FlasherLogic = () => {
  loading: boolean;
  succeeded: boolean | null;
  setFlashing: (value: boolean) => void;
  setSucceeded: (value: boolean | null) => void;
  close: () => void;
  getCurrentImage: () => Promise<OSImageRelease>;
  listAvailableImages: () => Promise<OSImageRelease[]>;
  getAvailableFreeSpace: () => Promise<number>;
  getUserPartitionPreservationSupported: (id: string) => Promise<boolean>;
  flashBoard: (
    image: OSImageRelease,
    preserveUserPartition: boolean,
    onFlashEvent: (event: FlashEvent) => void,
  ) => Promise<void>;
  openArduinoSupport: () => void;
  clearBoardAsUsed: (serial: string) => Promise<void>;
  flashingBoard: {
    id: string;
    name: string;
    type: string;
    connectionType: 'USB' | 'Network' | 'Local';
    protocol: string;
    serial: string;
    address: string;
  };
  // What the flasher UI adapts to. The logic derives these from the board being
  // flashed, so the components never branch on a board identity.
  // False when the board has no user partition to keep: the "keep data" option
  // is not offered and the per-image support check is skipped.
  preserveDataSupported: boolean;
  // Picture showing where the boot-mode jumper goes on this board.
  preparationImage: ReactNode;
};
