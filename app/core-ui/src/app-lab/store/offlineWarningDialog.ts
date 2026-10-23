import { create } from 'zustand';

// State for the single app-wide offline warning dialog, rendered by main. It
// lives here rather than in the dialog so the network settings dialog can see
// when this one is open without a second copy of the flag, and so a board
// flash — which unmounts the dialog — cannot lose the user's answer.
interface OfflineWarningDialogStore {
  open: boolean;
  setOpen: (open: boolean) => void;
  // The user answered the warning, by continuing offline, opening network
  // settings or closing it. Cleared when the board goes unreachable, so the
  // warning is offered again for the next board that comes up offline.
  choiceMade: boolean;
  setChoiceMade: (choiceMade: boolean) => void;
  wasClosedByUser: boolean;
  setWasClosedByUser: (wasClosedByUser: boolean) => void;
}

export const useOfflineWarningDialogStore = create<OfflineWarningDialogStore>(
  (set) => ({
    open: false,
    setOpen: (open: boolean): void => set({ open }),
    choiceMade: false,
    setChoiceMade: (choiceMade: boolean): void => set({ choiceMade }),
    wasClosedByUser: false,
    setWasClosedByUser: (wasClosedByUser: boolean): void =>
      set({ wasClosedByUser }),
  }),
);
