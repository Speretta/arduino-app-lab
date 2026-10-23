import { createRouter } from '@tanstack/react-router';

import RouteError from './features/route-error/RouteError';
import { routeTree } from './routeTree.gen';

const router = createRouter({
  routeTree,
  defaultHashScrollIntoView: true,
  defaultErrorComponent: RouteError,
});

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export default router;
