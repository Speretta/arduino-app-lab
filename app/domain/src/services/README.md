# Domain services: injected platform implementations

This directory holds the service layer that `app/core-ui` calls. Some services (HTTP API
clients like `builder-api-service`) are implemented here directly. The rest are **injected**:
the domain package exports typed function bindings with no real implementation, and the host
app supplies the implementation at startup.

App Lab is the main user of injection. Its implementations call Wails-generated Go bindings
(`wailsjs/go/app/App`), which only exist inside `standalone-apps/app-lab-desktop`. Injection is
what lets core-ui call `getBoards()` as a plain import while the code that actually talks to Go
lives in the Wails package.

## The flow

```
app/domain                          declares the contract and the mutable bindings
  board-service/board-service.type.ts    →  interface BoardService { getBoards(): ... }
  board-service/boardService.impl.ts     →  export let getBoards = <throws "not implemented">
                                             export const setBoardService = (s) => { getBoards = s.getBoards; ... }

app/core-ui                         imports and calls the bindings
  import { getBoards } from '@cloud-editor-mono/domain/src/services/services-by-app/app-lab'
  ... getBoards()

standalone-apps/app-lab-desktop     implements and injects, once, at startup
  frontend/src/services/boardService.impl.standalone.ts   →  calls wailsjs Go bindings
  frontend/src/dependencies.ts                            →  injectDependencies() calls every setter
  frontend/src/App.tsx                                    →  runs injectDependencies() at module scope,
                                                             before the first render
```

## Why it works: ES module live bindings

`boardService.impl.ts` declares each method as `export let`. An ES module import is a live
reference to that binding, not a copy. When `setBoardService` reassigns `getBoards`, every module
that imported `getBoards` sees the new function on its next call. No registry object, no lookup,
no container — the language does the indirection.

## Why this pattern

- **core-ui stays platform-agnostic.** It cannot import `wailsjs` bindings (they exist only in the
  standalone package) and must not know whether a method is served by Go, HTTP, or a mock. The
  dependency direction stays `infrastructure → domain → core-ui`; the standalone app depends on
  both and does the wiring.
- **Call sites are plain functions.** Consumers write `await getBoards()` anywhere: React
  components, zustand stores, react-query functions, event handlers, non-React modules. A React
  context could not serve the non-component call sites.
- **The contract is compiler-checked.** Each binding is typed as `BoardService['getBoards']`, and
  each setter takes the full interface, so a host cannot inject a partial or drifting
  implementation.
- **Missing bindings fail loud.** The default implementation throws
  `"<method> service not implemented"`, so a forgotten injection surfaces as a named error on
  first call, not as undefined behavior.
- **One manifest per app.** `dependencies.ts` lists every platform capability the app uses. Read
  it to know the app's full platform surface.
- **Testing needs no module mocks.** A test calls `setBoardService(mockBoardService)` directly.
  Mocks are co-located (`boardService.mock.ts`) and exported through the service index.

## Adding a method to an existing service

Five steps, in this order. The compiler checks 1–3. **It does not check 4 — see gotchas.**

1. Add the method to the interface in `<service>.type.ts`.
2. Add the `export let` binding with a throwing default in the domain `*.impl.ts`.
3. Implement it in the host: `standalone-apps/app-lab-desktop/frontend/src/services/<service>.impl.standalone.ts`.
4. Add the reassignment line inside `set<Service>` in the domain `*.impl.ts`.
5. Update the co-located mock if one exists.

## Adding a new service

1. Create `app/domain/src/services/<name>-service/` with `<name>-service.type.ts`,
   `<name>Service.impl.ts` (bindings + setter), `index.ts`, and a mock if useful.
2. Export it from the app barrel: `services-by-app/app-lab/index.ts` (or `shared/` if both apps
   use it).
3. Implement it in the standalone package and register the setter in `dependencies.ts`.

## Gotchas

- **The setter is the unchecked link.** Adding a method to the interface forces you to update the
  default binding and the host implementation, but nothing forces the reassignment line in the
  setter. Forgetting it leaves the throwing default in place with all types green. When you add a
  method, check the setter.
- **Do not call a service at module import time.** Injection runs in `App.tsx` at module scope,
  before the first render — but after imports are evaluated. A service call in a module body may
  run before injection and hit the throwing default. Call services from hooks, handlers, and
  functions, not from module top level.
- **Do not copy the binding before injection.** `getBoards()` as a direct call always reads the
  live binding. But `const fn = getBoards` (or destructuring a namespace import) copies the
  current value; taken before injection, the copy stays the thrower forever. Import the named
  function and call it directly.
- **Bindings are module-global state.** Everything in one JS realm shares them. In tests, inject
  per test (or per suite) and be careful with parallel tests that inject different
  implementations.
- **Use the throwing default.** Some older services declare bare `export let` bindings with no
  default (`fileOpenerService.impl.ts`), which fail as `TypeError: x is not a function` instead of
  a named error. New services should follow `boardService.impl.ts` and throw
  `"<method> service not implemented"`. A binding may also carry a real default that hosts can
  override (`updaterService.ts` defaults some methods to HTTP implementations from
  infrastructure); use that only when a genuine browser implementation exists.
