import type { LspReferencesResult } from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { create } from 'zustand';

interface LspReferencesStore {
  result: LspReferencesResult | null;
  show: (result: LspReferencesResult) => void;
  close: () => boolean;
}

export const useLspReferencesStore = create<LspReferencesStore>((set, get) => ({
  result: null,
  show: (result: LspReferencesResult): void => set({ result }),
  close: (): boolean => {
    if (!get().result) {
      return false;
    }
    set({ result: null });
    return true;
  },
}));
