import { SessionSummary } from '../services';

// One sidebar folder: the sessions opened for the same app. `appId` is '' for the general folder,
// which holds the sessions started outside an app.
export interface SessionFolder {
  appId: string;
  name: string;
  sessions: SessionSummary[];
}

// Groups sessions into one folder per app, in the order they first appear in the list — which the host orders by
// creation, so the app with the newest chat leads and the general folder takes part in that order like any other.
// A folder exists only as long as it has sessions: it is the grouping itself, never created or deleted.
export const groupSessionsByApp = (
  sessions: SessionSummary[],
  generalName: string,
): SessionFolder[] => {
  const byAppId = new Map<string, SessionFolder>();
  for (const session of sessions) {
    const appId = session.workspaceAppId ?? '';
    let folder = byAppId.get(appId);
    if (!folder) {
      // The remembered name is a snapshot from when the session was opened; the id is the last resort for an
      // app whose name never made it into the store.
      folder = {
        appId,
        name: appId ? session.workspaceName || appId : generalName,
        sessions: [],
      };
      byAppId.set(appId, folder);
    }
    folder.sessions.push(session);
  }
  return [...byAppId.values()];
};
