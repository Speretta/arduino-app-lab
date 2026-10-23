import { decodeBase64ToString } from '@cloud-editor-mono/domain/src/services/services-by-app/app-lab';

// Built-in ids decode to 'examples:<path>'; a bare prefix is already decoded.
export const isExampleAppId = (appId: string): boolean =>
  appId.startsWith('examples:') ||
  decodeBase64ToString(appId).startsWith('examples:');
