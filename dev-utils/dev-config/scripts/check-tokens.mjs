// Fails the build when a referenced CSS design token is not defined anywhere.
//
// Every colour in this repo comes from a CSS custom property. A reference to a
// token that nothing defines renders as an invalid value: the declaration is
// dropped (or falls back to a stale hardcoded hex), so the bug is invisible
// until someone looks at the screen. This check makes it loud instead.
//
// Token sources (see ui-packages/ui-components/public/):
//   al-tokens.scss        vendored design-system snapshot — the token NAME universe.
//                         Name-complete against the upstream package, so this check
//                         needs no private dependency installed.
//   ce-tokens.scss        Cloud-Editor-owned tokens, per [data-art-theme] theme.
//   al-custom-tokens.scss App Lab-owned tokens, dark only.
// Properties a component declares for itself (geometry, offsets) also count.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const PUBLIC = 'ui-packages/ui-components/public';

// Directories holding App Lab-only styles. Everything else is checked against the
// Cloud Editor token set, which is the stricter of the two (App Lab's set adds
// al-custom-tokens on top), so shared files are validated for both apps at once.
const AL_DIRS = [
  'ui-packages/ui-components/lib/components-by-app/app-lab',
  'ui-packages/ui-components/lib/dialogs/app-lab',
  'ui-packages/ui-components/lib/file-tree',
  'app/core-ui/src/app-lab',
  'standalone-apps/app-lab-desktop',
];

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  'coverage',
]);

function walk(dir, ext, out = []) {
  let entries;
  try {
    entries = readdirSync(join(ROOT, dir));
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const rel = join(dir, entry);
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, ext, out);
    else if (ext.some((e) => entry.endsWith(e))) out.push(rel);
  }
  return out;
}

function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

// Comments can hold example token names and commented-out declarations; both
// would otherwise register as real references or real definitions.
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\w])\/\/[^\n]*/g, '$1');
}

function definitionsIn(source) {
  return new Set(
    [...stripComments(source).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]),
  );
}

const scssFiles = walk('.', ['.scss']);
const tsFiles = walk('.', ['.ts', '.tsx']);

const designSystem = definitionsIn(read(`${PUBLIC}/al-tokens.scss`));
const cloudEditorOwned = definitionsIn(read(`${PUBLIC}/ce-tokens.scss`));
const appLabOwned = definitionsIn(read(`${PUBLIC}/al-custom-tokens.scss`));

// Properties declared next to their use (sizes, offsets, per-component knobs).
// Custom properties inherit, so a declaration anywhere counts: these are set on an
// ancestor of the element that reads them, or written at runtime through the
// matching SCSS `:export` (see setCSSVariable).
// The three token files above are excluded so that each app's own token set stays
// distinct — otherwise an App Lab-only token would read as defined for the editor.
const local = new Set();
for (const file of scssFiles) {
  if (file.startsWith(PUBLIC)) continue;
  for (const token of definitionsIn(read(file))) local.add(token);
}

const base = new Set([...designSystem, ...cloudEditorOwned, ...local]);
const profiles = {
  'cloud-editor': base,
  'app-lab': new Set([...base, ...appLabOwned]),
};

const lowercased = new Map(
  [...profiles['app-lab']].map((token) => [token.toLowerCase(), token]),
);

const errors = [];
const warnings = [];

// Styles injected from TypeScript (CodeMirror themes, inline styles) reference
// tokens as plain strings, so they need the same validation as the stylesheets.
for (const file of [...scssFiles, ...tsFiles]) {
  if (file.startsWith(PUBLIC)) continue; // the token files themselves
  const profile = AL_DIRS.some((d) => file.startsWith(d))
    ? 'app-lab'
    : 'cloud-editor';
  const defined = profiles[profile];
  const source = stripComments(read(file));
  const lines = source.split('\n');

  lines.forEach((line, i) => {
    for (const m of line.matchAll(/var\(\s*(--[\w-]+)\s*(,)?/g)) {
      const [, token, hasFallback] = m;
      if (defined.has(token)) continue;
      const where = `${relative('.', file)}:${i + 1}`;
      const casing = lowercased.get(token.toLowerCase());
      if (casing && casing !== token)
        errors.push(
          `${where}  ${token} is not defined — did you mean ${casing}? (custom properties are case-sensitive)`,
        );
      else if (hasFallback)
        warnings.push(
          `${where}  ${token} is not defined; only its hardcoded fallback renders [${profile}]`,
        );
      else
        errors.push(
          `${where}  ${token} is not defined and has no fallback — this declaration is dropped [${profile}]`,
        );
    }
  });
}

// A Cloud Editor token defined for one theme but not the other renders in one
// theme and vanishes in the other.
const ceSource = stripComments(read(`${PUBLIC}/ce-tokens.scss`));
const themeBlocks = { dark: new Set(), light: new Set() };
for (const m of ceSource.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const [, selector, body] = m;
  for (const theme of ['dark', 'light'])
    if (selector.includes(`"${theme}"`))
      for (const d of definitionsIn(body)) themeBlocks[theme].add(d);
}
for (const [theme, other] of [
  ['dark', 'light'],
  ['light', 'dark'],
])
  for (const token of themeBlocks[theme])
    if (!themeBlocks[other].has(token))
      errors.push(
        `${PUBLIC}/ce-tokens.scss  ${token} is defined for ${theme} but not ${other}`,
      );

for (const warning of warnings) console.warn(`warning  ${warning}`);
for (const error of errors) console.error(`error    ${error}`);

console.log(
  `\nchecked ${scssFiles.length} stylesheets + ${tsFiles.length} TS files against ${profiles['cloud-editor'].size} cloud-editor / ${profiles['app-lab'].size} app-lab tokens`,
);

if (errors.length) {
  console.error(
    `\n${errors.length} undefined token reference(s). Define the token or fix the name.`,
  );
  process.exit(1);
}
console.log(
  `ok       no undefined token references (${warnings.length} fallback-only warning(s))`,
);
