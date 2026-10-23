import { Config } from '@cloud-editor-mono/common';
import { WretchError } from 'wretch/resolver';

import { httpFormDataPost } from '../fetch';
import { PROJECT_HUB_IMPORT_FAILED_ERROR } from './constants';
import {
  CreateExternalProjectParams,
  CreateExternalProjectResult,
} from './projectHubApi.type';

function handleProjectHubError(error: WretchError): never {
  const body = error.json as Record<string, unknown> | undefined;
  const code =
    body?.['code'] ??
    body?.['error_code'] ??
    body?.['error'] ??
    body?.['detail'] ??
    body?.['message'];

  if (typeof code === 'string') {
    throw new Error(code);
  }

  throw new Error(PROJECT_HUB_IMPORT_FAILED_ERROR);
}

export async function createExternalProjectV1Request(
  params: CreateExternalProjectParams,
  origin: string = Config.PROJECT_HUB_API_URL,
): Promise<CreateExternalProjectResult> {
  const endpoint = `/api/v1/projects/external-projects/`;

  const { archive, fileName, board, token, abortController } = params;

  const response = await httpFormDataPost<CreateExternalProjectResult>({
    url: origin,
    endpoint,
    body: {
      file: new File([archive], fileName, { type: 'application/zip' }),
      ...(board ? { board } : {}),
    },
    token,
    abortController,
    handleError: handleProjectHubError,
  });

  if (!response) {
    throw new Error(
      `Call to "${endpoint}" did not respond with the expected result`,
    );
  }

  return response;
}
