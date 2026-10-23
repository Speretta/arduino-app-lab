import { Config } from '@cloud-editor-mono/common';

import { httpGet } from '../fetch';
import { CustomizableColors_CustomizationApi } from './customizationApi.type';

/**
 * Fetches the custom color palette configured for an organization/space.
 * Resolves to `undefined` when the space has no custom palette or the request
 * fails — both are treated by callers as "no custom palette".
 */
export async function getCustomizableColorsRequest(
  organizationId: string,
  token: string,
): Promise<CustomizableColors_CustomizationApi | void> {
  return httpGet<CustomizableColors_CustomizationApi>({
    url: Config.API_URL,
    endpoint: `/customization/v1/customizable/colors/${organizationId}`,
    token,
    handleError: () => undefined,
  });
}
