import { useEffect } from 'react';

import styles from './app-lab-theme-provider.module.scss';

interface AppLabThemeProviderProps {
  children?: React.ReactNode;
}

/**
 * App Lab's own theme provider. App Lab always renders in dark mode and does
 * not depend on the Cloud Editor's theme provider (or any private UI
 * dependency). It applies the dark design tokens via the `data-art-theme`
 * attribute, which the design-token sheets key off, so every token resolves
 * to its dark value.
 */
const AppLabThemeProvider: React.FC<AppLabThemeProviderProps> = ({
  children,
}: AppLabThemeProviderProps) => {
  // Also set the attribute on the document root so portaled content (tooltips,
  // context menus) rendered outside this wrapper still resolves dark tokens.
  useEffect(() => {
    document.documentElement.setAttribute('data-art-theme', 'dark');
  }, []);

  return (
    <div className={styles.themeContainer} data-art-theme="dark">
      {children}
    </div>
  );
};

export default AppLabThemeProvider;
