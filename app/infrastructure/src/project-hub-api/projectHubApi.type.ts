import { PROJECT_HUB_BOARD_SKU } from './constants';

export type ProjectHubBoardSku =
  typeof PROJECT_HUB_BOARD_SKU[keyof typeof PROJECT_HUB_BOARD_SKU];

export type CreateExternalProjectParams = {
  archive: Blob;
  fileName: string;
  board?: ProjectHubBoardSku;
  token: string;
  abortController?: AbortController;
};

export type CreateExternalProjectResult = {
  data: {
    id: number;
    name: string;
  };
};
