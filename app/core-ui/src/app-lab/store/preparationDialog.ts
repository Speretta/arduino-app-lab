import { create } from 'zustand';

// The release whose dependencies are missing, and what to do once they are in.
interface PreparationDialogStore {
  open: boolean;
  appId?: string;
  appName?: string;
  onPrepared?: () => void;
  setOpen: (open: boolean) => void;
  openFor: (appId: string, appName: string, onPrepared?: () => void) => void;
}

export const usePreparationDialogStore = create<PreparationDialogStore>(
  (set) => ({
    open: false,
    setOpen: (open: boolean): void =>
      set(
        open
          ? { open }
          : {
              open,
              appId: undefined,
              appName: undefined,
              onPrepared: undefined,
            },
      ),
    openFor: (appId, appName, onPrepared): void =>
      set({ open: true, appId, appName, onPrepared }),
  }),
);
