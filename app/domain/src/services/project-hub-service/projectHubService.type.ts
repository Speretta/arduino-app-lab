import { ProjectHubBoardSku } from '@cloud-editor-mono/infrastructure';

export type CreateProjectHubDraftParams = {
  archive: Blob;
  fileName: string;
  board?: ProjectHubBoardSku;
  abortController?: AbortController;
};

export type ProjectHubDraft = {
  id: number;
  name: string;
  draftUrl: string;
};
