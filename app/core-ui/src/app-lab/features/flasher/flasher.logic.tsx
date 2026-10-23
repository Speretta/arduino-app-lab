import {
  cancelFlash,
  flash,
  getAvailableFreeSpace,
  getBoards,
  getOSImageVersion,
  isUserPartitionPreservationSupported,
  listAvailableOSImages,
  openLinkExternal,
} from '@cloud-editor-mono/domain/src/services/services-by-app/app-lab';
import {
  appLabBoardPreparation,
  appLabBoardPreparationVentunoQ,
} from '@cloud-editor-mono/images/assets/images/images-by-app/app-lab';
import { FlasherLogic } from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { BOARD_FQBN } from '../../../../../common/consts/consts';
import { BOARD_APP_MAPPING } from '../../constants';
import { BoardAppInfo } from '../../hooks/useBoards';
import { useBoardSerialTracker } from '../../hooks/useBoardSerialTracker';
import { get, set } from '../../services/persistentStore';
import { useBoardLifecycleStore } from '../../store/boardLifecycle';

const clearBoardAppMapping = async (boardSerial: string): Promise<void> => {
  const mapping =
    (await get<Record<string, BoardAppInfo>>(BOARD_APP_MAPPING)) || {};
  delete mapping[boardSerial];
  await set(BOARD_APP_MAPPING, mapping);
};

const ARDUINO_SUPPORT_URL = 'https://www.arduino.cc/en/contact-us/';

type BoardFlashing = Pick<
  ReturnType<FlasherLogic>,
  'preserveDataSupported' | 'preparationImage'
>;

// How each board flashes. Boards not listed here flash like the Uno Q.
const DEFAULT_BOARD_FLASHING: BoardFlashing = {
  preserveDataSupported: true,
  preparationImage: appLabBoardPreparation,
};
const BOARD_FLASHING: Partial<Record<string, BoardFlashing>> = {
  // Ventuno Q has no user partition to keep, and its jumper sits elsewhere.
  [BOARD_FQBN.VENTUNO_Q]: {
    preserveDataSupported: false,
    preparationImage: appLabBoardPreparationVentunoQ,
  },
};

type CreateFlasherLogic = (
  selectBoard: (boardId: string) => Promise<void>,
) => FlasherLogic;

export const createFlasherLogic: CreateFlasherLogic = function (
  selectBoard: (boardId: string) => Promise<void>,
): FlasherLogic {
  return function useFlasherLogic() {
    const { selectedConnectedBoard, setBoardIsFlashing } =
      useBoardLifecycleStore(
        useShallow((state) => ({
          selectedConnectedBoard: state.selectedConnectedBoard,
          setBoardIsFlashing: state.setBoardIsFlashing,
        })),
      );
    const [flashing, setFlashing] = useState(false);
    const [succeeded, setSucceeded] = useState<boolean | null>(null);
    const { clearBoardAsUsed } = useBoardSerialTracker();
    const [flashingBoard] = useState(selectedConnectedBoard!);

    const { data: boards } = useQuery({
      queryKey: ['list-boards'],
      queryFn: getBoards,
      enabled: !flashing,
      refetchInterval: 1000,
    });

    const boardFlashing =
      BOARD_FLASHING[flashingBoard.fqbn] ?? DEFAULT_BOARD_FLASHING;

    // Keep a stable reference so effects depending on it don't re-run on every
    // render (e.g. while flash progress events re-render the parent).
    const getCurrentImage = useCallback(
      async () => ({
        version_label: await getOSImageVersion(),
      }),
      [],
    );

    return {
      loading: boards?.every((b) => b.serial !== flashingBoard.serial) ?? true,
      succeeded,
      setFlashing,
      setSucceeded,
      close: (): void => {
        cancelFlash();
        if (succeeded) {
          selectBoard(flashingBoard.serial);
          // Clear app mapping when board is flashed to prevent old app info from causing issues
          clearBoardAppMapping(flashingBoard.serial);
        } else {
          setBoardIsFlashing(false);
        }
      },
      getCurrentImage,
      listAvailableImages: listAvailableOSImages,
      getAvailableFreeSpace,
      getUserPartitionPreservationSupported:
        isUserPartitionPreservationSupported,
      flashBoard: flash,
      openArduinoSupport: (): void => {
        openLinkExternal(ARDUINO_SUPPORT_URL);
      },
      clearBoardAsUsed,
      flashingBoard,
      ...boardFlashing,
    };
  };
};
