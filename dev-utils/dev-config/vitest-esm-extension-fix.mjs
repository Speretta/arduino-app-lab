/**
 * Node.js ESM resolve hook for the Vitest test runner.
 *
 * Some published pure-ESM dependencies ship compiled files that use
 * extension-less relative import specifiers (e.g. `import x from '../foo/bar'`
 * instead of `'../foo/bar.js'`). Bundlers (esbuild/rollup, i.e. `vite dev` /
 * `vite build`) auto-append the extension, but Node's native ESM loader does
 * not — it throws ERR_MODULE_NOT_FOUND. Vitest hands externalized `node_modules`
 * ESM to that native loader, so those packages break under test.
 *
 * This hook only engages AFTER a resolution has already failed: for a relative
 * specifier that lacks a JS extension it retries once with `.js`. It is generic
 * and version-independent — a no-op for packages that resolve correctly, and a
 * fix for any dependency (current or future) that ships this malformed ESM.
 *
 * Wired into Vitest via the top-level `test.execArgv` in
 * `vite.config.shared.js`, so it applies only to test workers — never to the
 * app dev server or production build.
 */
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (
      err?.code === 'ERR_MODULE_NOT_FOUND' &&
      /^\.\.?\//.test(specifier) && // relative specifier ('./' or '../')
      !/\.[mc]?js$/.test(specifier) // that has no .js/.mjs/.cjs extension
    ) {
      try {
        return await nextResolve(specifier + '.js', context);
      } catch {
        throw err; // keep the original (clearer) error if the retry also fails
      }
    }
    throw err;
  }
}
