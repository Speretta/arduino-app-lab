import { AppInfo, AppStatus } from '@cloud-editor-mono/infrastructure';

export interface AppItemProps {
  id?: string;
  variant?: 'default' | 'skeleton';
  name?: string;
  description?: string;
  icon?: string;
  status?: AppStatus;
  example?: boolean;
  byteSize?: number;
  defaultApp?: AppInfo;
  onRename?: () => void;
  onDuplicate?: () => void;
  onExport?: () => void;
  onCreateRelease?: () => void;
  // Set while a release of this App is being created: the action stays, disabled, with this reason.
  createReleaseDisabledReason?: string;
  onReleaseInfo?: () => void;
  // Set for an App installed from a release, which shows the release badge.
  releaseBadge?: { label?: string; createdAt?: string };
  onSetAsDefault?: () => void;
  onDelete?: () => void;
  onMenuOpen?: (isOpen: boolean) => void;
  isAnimating?: boolean;
}
