import { AppInfo } from '@cloud-editor-mono/infrastructure';
import { create } from 'zustand';

// Open-state and target app for the single app-wide create-release flow, owned
// by main and triggered from both the app list and the app detail header. The
// intro dialog runs first until the user opts out of it.
interface ReleaseDialogStore {
  open: boolean;
  step: 'intro' | 'form';
  app?: AppInfo;
  setOpen: (open: boolean) => void;
  openFor: (app: AppInfo, skipIntro: boolean) => void;
  showForm: () => void;
}

export const useReleaseDialogStore = create<ReleaseDialogStore>((set) => ({
  open: false,
  step: 'intro',
  setOpen: (open: boolean): void =>
    set(open ? { open } : { open, app: undefined }),
  openFor: (app: AppInfo, skipIntro: boolean): void =>
    set({ open: true, app, step: skipIntro ? 'form' : 'intro' }),
  showForm: (): void => set({ step: 'form' }),
}));
