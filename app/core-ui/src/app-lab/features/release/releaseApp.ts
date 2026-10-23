import { BOARD_FQBN } from '@cloud-editor-mono/common';
import { AppDetailedInfo, AppInfo } from '@cloud-editor-mono/infrastructure';
import {
  formatReleaseDate,
  ReleaseDetails,
  ReleaseTarget,
} from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';

// Installed releases are listed with the user's Apps.
export const MY_APPS_FILTER = 'apps,releases';

// The boards arduino-app-cli 0.14.0-rc.3 builds for (platform.SupportedBoards).
// Product names, so they are not translated.
export const RELEASE_TARGETS: ReleaseTarget[] = [
  { id: 'unoq', label: 'Arduino UNO Q' },
  { id: 'ventunoq', label: 'Arduino VENTUNO Q' },
];

export const boardReleaseTarget = (fqbn?: string): string =>
  fqbn === BOARD_FQBN.VENTUNO_Q ? 'ventunoq' : 'unoq';

// The start error arduino-app-cli returns for a release whose containers or
// models are not on the board.
export const NOT_PREPARED_ERROR_CODE = 'not_prepared';

export const isReleaseArchive = (path: string): boolean =>
  path.endsWith('.ard');

const formatManifestDate = (createdAt?: string | null): string | undefined => {
  if (!createdAt) return undefined;
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? undefined : formatReleaseDate(date);
};

export const releaseBadge = (
  app: Pick<AppInfo, 'release_label' | 'created_at'>,
): { label?: string; createdAt?: string } => ({
  label: app.release_label,
  createdAt: formatManifestDate(app.created_at),
});

// "Magic Storyteller 2026-07-17 15:40": names the release in the notifications.
export const releaseDisplayName = (
  appName: string,
  createdAt: string,
): string => `${appName} ${createdAt}`;

// "Magic_Storyteller_1.0_2026-07-17_15-40.ard". The design writes the time with
// a colon, which Windows does not allow in a file name.
export const releaseFileName = (
  appName: string,
  createdAt: string,
  label?: string,
): string =>
  `${[appName, label, createdAt]
    .filter(Boolean)
    .join('_')
    .replace(/:/g, '-')
    .replace(/\s+/g, '_')
    .replace(/[\\/*?"<>|]/g, '')}.ard`;

// The Release info dialog content of an installed release or a release archive.
export const releaseInfoDetails = (
  app: Partial<
    Pick<
      AppDetailedInfo,
      'name' | 'icon' | 'created_at' | 'release_label' | 'notes'
    >
  >,
): ReleaseDetails => ({
  name: app.name ?? '',
  icon: app.icon,
  createdAt: formatManifestDate(app.created_at),
  label: app.release_label,
  note: app.notes?.trim() || undefined,
});
