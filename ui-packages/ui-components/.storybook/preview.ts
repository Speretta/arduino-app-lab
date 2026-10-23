import { createElement } from 'react';

import type { Preview } from '@storybook/react-vite';

// Global stylesheet the apps load in their App.tsx (theme variables, scrollbar
// styling, and utility classes like `.visually-hidden`). Without it, global
// class names used directly in components have no effect in the preview.
// @ts-expect-error - no type declarations for scss side-effect imports
import '../public/index.scss';

// Design tokens (ce-tokens.scss, al-tokens.scss, al-custom-tokens.scss), gated
// behind `[data-art-theme]` — see the decorator below, which sets it the same
// way AppLabThemeProvider does for the real app.
// @ts-expect-error - no type declarations for scss side-effect imports
import '../public/al-tokens.scss';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
    backgrounds: { disable: true },
  },
  globalTypes: {
    theme: {
      toolbar: {
        title: 'Theme',
        items: [
          { value: 'dark', title: 'Dark' },
          { value: 'light', title: 'Light' },
        ],
      },
    },
  },
  initialGlobals: { theme: 'dark' },
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme as string;
      document.documentElement.setAttribute('data-art-theme', theme);
      return createElement('div', { 'data-art-theme': theme }, createElement(Story));
    },
  ],
};

export default preview;
