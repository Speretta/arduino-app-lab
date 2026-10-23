export interface OSImageRelease {
  version_label?: string;
  id?: string;
  latest?: boolean;
  board?: string;
  os?: string;
}

export interface FlashEvent {
  step: 'downloading' | 'extracting' | 'flashing';
  log?: string;
  progress?: number;
  total?: number;
}
