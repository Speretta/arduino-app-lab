import { ThemeProvider as ARTThemeProvider } from '@bcmi-labs/art-ui';
import {
  getAccessToken,
  getAuthClient,
  getSpace,
  getSpaceStorageInstance,
} from '@cloud-editor-mono/domain';
import {
  deploymentPath,
  getCustomizableColorsRequest,
} from '@cloud-editor-mono/infrastructure';
import { useContext, useLayoutEffect } from 'react';

import { AuthContext } from '../auth/authContext';
import { themeManagerInstance } from './instances';
import styles from './theme-provider.module.scss';

// Builds the custom-color palette argument expected by `setPalette`.
const toHexPalette = (data: {
  color?: string;
  readability?: boolean;
}): { hex: `#${string}`; useClosestAccessibleColor: boolean } => ({
  hex: data.color as `#${string}`,
  useClosestAccessibleColor: data.readability ?? false,
});

// Syncs the palette with the given space, falling back to the default palette when the space has none.
const setPaletteBySpaceId = async (spaceId: string): Promise<void> => {
  try {
    const token = await getAccessToken();
    const colors = await getCustomizableColorsRequest(spaceId, token);
    themeManagerInstance.setPalette(
      colors?.color ? toHexPalette(colors) : 'mkr',
    );
  } catch {
    themeManagerInstance.setPalette('mkr');
  }
};

interface ThemeProviderProps {
  children?: React.ReactNode;
}

const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
}: ThemeProviderProps) => {
  // Auth is injected only when the editor runs as the consumed component instead of as its own app.
  const { isAuthInjected } = useContext(AuthContext);

  // Palette resolution depends on the component environment, so it must run after mount instead of at module scope.
  useLayoutEffect(() => {
    // Whitelabel environments resolve the palette from the auth-client customization.
    if (deploymentPath.customKey) {
      // Unlike cloud-website there is no top-level-await client instance here, so resolve the same customization through the async client.
      getAuthClient()
        .then(async (client) => {
          const customization = client.getCustomization();

          if (!customization?.organization_id) {
            themeManagerInstance.setPalette('mkr');
            return;
          }

          // The component must skip the cached customization colors and wait for the fetched palette, otherwise a stale cache can break the palette.
          if (isAuthInjected) {
            await setPaletteBySpaceId(customization.organization_id);
            return;
          }

          themeManagerInstance.setPalette(
            customization.colors?.color
              ? toHexPalette(customization.colors)
              : 'mkr',
          );

          // Not awaited: awaiting would delay the first paint on every custom domain, even those without a color palette.
          setPaletteBySpaceId(customization.organization_id);
        })
        .catch(() => undefined);
      return;
    }

    const resolveSpacePalette = async (): Promise<void> => {
      const orgId = getSpace(); // undefined for the personal space ('my-cloud')

      if (!orgId) {
        themeManagerInstance.setPalette('mkr');
        return;
      }

      await setPaletteBySpaceId(orgId);
    };

    resolveSpacePalette();

    const storage = getSpaceStorageInstance();
    const listener = (_: string, key: string): void => {
      if (key !== 'space-id') return;

      resolveSpacePalette();
    };

    storage.subscribe(listener);

    return () => storage.unsubscribe(listener);
  }, [isAuthInjected]);

  return (
    <ARTThemeProvider themeManager={themeManagerInstance}>
      <div className={styles.themeContainer}>{children}</div>
    </ARTThemeProvider>
  );
};

export default ThemeProvider;
