import { AppDetailedInfo, AppStatus } from './orchestrator-api';

// App names are display text, not path components: the orchestrator derives the
// directory with slug.Make(name) (see findAppPathByName), so "My Awesome App"
// becomes my-awesome-app and even "app; rm -rf ~" becomes app-rm-rf. Neither the
// board shell nor the host filesystem ever sees the raw name, so this only keeps
// display names tame and avoids two names slugging to the same directory.
export const APP_NAME_INVALID_CHARACTERS_REGEX = /[^a-zA-Z0-9._ -]/;

export const ORGANIZATION_HEADER = 'X-Organization';
const CLASSROOM_SHARE_URL = 'https://classroom.google.com/u/0/share';

export const STATUSES_WHERE_RENAME_ALLOWED = [
  'stopped',
  'failed',
  'uninitialized',
] as const;

export const STATUSES_WHERE_RENAME_FORBIDDEN = [
  'starting',
  'running',
  'stopping',
] as const;

export function createUUID(): string {
  let dt = new Date().getTime();
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (dt + Math.random() * 16) % 16 | 0;
    dt = Math.floor(dt / 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
  return uuid;
}

export function buildShareToClassroomURL(
  target: URL,
  title: string,
  body: string,
): string {
  return `
  ${CLASSROOM_SHARE_URL}?url=${encodeURIComponent(
    target.toString(),
  )}&title=${title}&body=${body}
  `;
}

export function canRenameApp(
  app: AppDetailedInfo | undefined,
  appStatus: AppStatus | undefined,
): boolean {
  return (
    !app?.example &&
    appStatus != null &&
    STATUSES_WHERE_RENAME_ALLOWED.includes(
      appStatus as typeof STATUSES_WHERE_RENAME_ALLOWED[number],
    )
  );
}
