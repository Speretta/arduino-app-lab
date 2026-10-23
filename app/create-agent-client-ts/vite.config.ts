import { libConfig } from '@cloud-editor-mono/dev-config';
import { defineConfig } from 'vite';

import pkgJson from './package.json';

const pkg: any = pkgJson;

const externalDependencies = [
  ...Object.keys(pkg.peerDependencies || {}),
  ...Object.keys(pkg.dependencies || {}),
];

export default defineConfig(
  libConfig({
    exportName: 'create-agent-client-ts',
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
