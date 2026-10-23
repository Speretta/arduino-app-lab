import { libConfig } from '@cloud-editor-mono/dev-config';
import { defineConfig } from 'vite';

import pkgJson from './package.json';

const pkg = pkgJson as Record<string, any>;

const externalDependencies = [
  ...Object.keys(pkg.peerDependencies || {}),
  ...Object.keys(pkg.dependencies || {}),
];

export default defineConfig(
  libConfig({
    exportName: 'ui-components',
    externalDependencies,
    options: {
      css: {
        modules: {
          hashPrefix: pkg.name,
        },
      },
    },
  }),
);
