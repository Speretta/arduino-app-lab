import {
  ARTThemeManager,
  defaultThemeManagerStorage,
  IStorage,
  PALETTE_DEFAULT_KEY,
} from '@bcmi-labs/art-ui';
import { getSpaceStorageInstance } from '@cloud-editor-mono/domain';
import { deploymentPath } from '@cloud-editor-mono/infrastructure';

// ** the below mirrors `src/lib/services/instances.ts` from the Arduino `cloud-website` repo

/*
 * ==========================================
 * Custom palettes in Arduino Cloud are a function of space-id, so we scope the palette storage
 * to the space-id as well.
 * To achieve this, we namespace the palette storage entries under the `${PALETTE_DEFAULT_KEY}:${spaceId}` key.
 *
 * This way, different spaces can have different palettes and they are restored correctly on load without flash.
 * ==========================================
 */
const spaceScopedStorage: IStorage = ((): IStorage => {
  // Getter function for stable key for the palette storage, based on the current space.
  const getPaletteKey = (): string =>
    `${PALETTE_DEFAULT_KEY}:${
      deploymentPath.customKey || getSpaceStorageInstance().getSpace()
    }`;

  const storageInterface: IStorage = {
    get: (key: string) => {
      if (key !== PALETTE_DEFAULT_KEY)
        return defaultThemeManagerStorage.get(key);
      return defaultThemeManagerStorage.get(getPaletteKey());
    },
    set: (key: string, value: string) => {
      if (key !== PALETTE_DEFAULT_KEY)
        return defaultThemeManagerStorage.set(key, value);
      return defaultThemeManagerStorage.set(getPaletteKey(), value);
    },
  };
  return storageInterface;
})();

export const themeManagerInstance = new ARTThemeManager(
  'auto',
  spaceScopedStorage,
);
