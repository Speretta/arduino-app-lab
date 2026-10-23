// Backing store for "open this file in the app editor": ./openAppFileInEditor stashes the target
// here from outside the router tree (e.g. the AI assistant), the screens below read it back.
//
// Keep this module import-free. It is read from inside the route tree (appDetail.logic and
// useReloadApp), so anything it imports joins the router's own dependency graph — importing the
// router here is what the split from ./openAppFileInEditor exists to prevent. Both invariants are
// enforced by src/architecture/appLabImportCycles.test.ts, which explains the boot-time failure they
// avoid.

// The target file is stashed here and consumed once by the app-detail screen on mount (see useAppDetailLogic),
// which avoids threading a route search param through the generated router types.
let pending: { appId: string; file: string } | null = null;

// The app opened via a chip is a transient "peek": App Lab must not record it as the board's resume app (a normally-opened app still is). Cleared by useReloadApp once the user leaves it.
let peekedApp: string | null = null;

// Mark an app-relative file to auto-open once that app's editor mounts, as a peek.
export const stashAppFileToOpen = (appId: string, file: string): void => {
  pending = { appId, file };
  peekedApp = appId;
};

// True while `appId` is only being peeked (opened via a chip, not opened normally).
export const isPeekedApp = (appId: string): boolean => peekedApp === appId;

// Forget the peeked app once the user has moved on (opened another app or left the editor).
export const clearPeekedApp = (): void => {
  peekedApp = null;
};

// Same idea for the agent's "bring in a custom model" request: the brick whose model picker to open, consumed by the
// app-detail screen. It lives here rather than in its own module to stay inside the import-free half described above.
// Keyed by app because the agent can ask twice before either screen mounts, and one slot would drop the first request.
const pendingModelImports = new Map<string, string>();

// Mark a brick whose model picker should open once that app's screen mounts.
export const stashModelImport = (appId: string, brickId: string): void => {
  pendingModelImports.set(appId, brickId);
};

// Read the pending brick without consuming it (safe in a useState initializer, as above).
export const peekPendingModelImport = (appId: string): string | undefined =>
  pendingModelImports.get(appId);

// Consume it once the screen has opened the picker.
export const clearPendingModelImport = (appId: string): void => {
  pendingModelImports.delete(appId);
};

// Apps whose screen is mounted and listening for model-import events right now.
const modelImportSubscribers = new Set<string>();

// True while that app's screen will receive the event itself, so the caller need not stash and navigate.
export const isModelImportSubscribed = (appId: string): boolean =>
  modelImportSubscribers.has(appId);

// Called by the app-detail screen as it subscribes and unsubscribes.
export const setModelImportSubscribed = (appId: string, on: boolean): void => {
  if (on) {
    modelImportSubscribers.add(appId);
  } else {
    modelImportSubscribers.delete(appId);
  }
};

// Read the pending file without consuming it — pure, so it's safe in a useState initializer (StrictMode double-invokes those, and a consuming read would lose the value on the second call).
export const peekPendingAppFile = (appId: string): string | undefined =>
  pending && pending.appId === appId ? pending.file : undefined;

// Consume the pending file once the app-detail screen has actually opened it.
export const clearPendingAppFile = (appId: string): void => {
  if (pending && pending.appId === appId) {
    pending = null;
  }
};
