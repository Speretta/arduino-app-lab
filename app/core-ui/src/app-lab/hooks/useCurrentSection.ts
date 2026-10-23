import { AppsSection } from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { useLocation, useParams, useSearch } from '@tanstack/react-router';
import { useMemo } from 'react';

export const useCurrentSection = (): AppsSection | undefined => {
  const params = useParams({ strict: false });
  const location = useLocation();

  return useMemo(() => {
    const path = location.pathname;

    if (path.startsWith('/examples/')) return 'examples';
    if (path.startsWith('/my-apps/')) return 'my-apps';

    if (params.resourceId) return 'examples';
    if (params.appId) return 'my-apps';

    return undefined;
  }, [params.appId, params.resourceId, location.pathname]);
};

export const useCurrentBreadcrumbId = (): 'inspirations' | undefined => {
  const search = useSearch({ strict: false });

  return 'from' in search && search.from === 'inspirations'
    ? 'inspirations'
    : undefined;
};
