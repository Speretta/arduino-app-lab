import { Config } from '@cloud-editor-mono/common';
import { createExternalProjectV1Request } from '@cloud-editor-mono/infrastructure';

import { getAccessToken, noTokenReject } from '../arduino-auth';
import {
  CreateProjectHubDraftParams,
  ProjectHubDraft,
} from './projectHubService.type';

export function getProjectHubDraftUrl(projectId: number): string {
  return `${Config.PROJECT_HUB_URL}/projects/${projectId}/edit`;
}

export async function createProjectHubDraft(
  params: CreateProjectHubDraftParams,
): Promise<ProjectHubDraft> {
  const token = await getAccessToken();
  if (!token) return noTokenReject();

  const { data } = await createExternalProjectV1Request({
    ...params,
    token,
  });

  const { id, name } = data;
  return { id, name, draftUrl: getProjectHubDraftUrl(id) };
}
