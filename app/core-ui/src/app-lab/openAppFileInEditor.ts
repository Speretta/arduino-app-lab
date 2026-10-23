import { getAppDetail } from '@cloud-editor-mono/domain/src/services/services-by-app/app-lab';

import { stashAppFileToOpen } from './openAppFile';
import router from './router';
import { isExampleAppId } from './utils/appSection';

// Imperative "open this file in the app editor", used from outside the router tree (e.g. the AI
// assistant). This is the only half of the feature that touches the router, which is why it is split
// from ./openAppFile: nothing reachable from the route tree may import this module, or the import
// cycle described there closes again. Reached from lib/app-components/app-lab/AppLab.tsx, which is
// also what @cloud-editor-mono/core-ui/app-lab resolves to for the AI package's dynamic import.
export const openAppFileInEditor = async (
  appId: string,
  file: string,
): Promise<void> => {
  stashAppFileToOpen(appId, file);
  // The my-apps route makes the editor writable; examples must not land there.
  const to = (await isExampleApp(appId))
    ? '/examples/$appId'
    : '/my-apps/$appId';
  await router.navigate({ to, params: { appId } });
};

// arduinoapps.readOnly's rule: flag first, id backs it up, no answer = closed.
const isExampleApp = async (appId: string): Promise<boolean> => {
  try {
    return (
      (await getAppDetail(appId)).example === true || isExampleAppId(appId)
    );
  } catch {
    return true;
  }
};
