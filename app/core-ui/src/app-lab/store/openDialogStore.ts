import { create, StoreApi, UseBoundStore } from 'zustand';

// Open-state for a dialog that main renders once, app-wide, and that several
// features need to open. Stores carrying more than the open flag declare their
// own shape and reuse this one's field names (see importAppDialog).
export interface OpenDialogStore {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const createOpenDialogStore = (): UseBoundStore<
  StoreApi<OpenDialogStore>
> =>
  create<OpenDialogStore>((set) => ({
    open: false,
    setOpen: (open: boolean): void => set({ open }),
  }));
