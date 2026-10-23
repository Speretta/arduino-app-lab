import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BoardScopedQuery } from '../boardScopedQuery';
import { useAppsOnAgentExit } from './useAppsOnAgentExit';

const invalidateQueries = vi.fn();
const queryClient = new QueryClient();
queryClient.invalidateQueries = invalidateQueries as never;

const wrapper = ({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

const leaveAgentMode = (): void => {
  const { rerender } = renderHook(
    (active: boolean) => useAppsOnAgentExit(active),
    { initialProps: true, wrapper },
  );
  rerender(false);
};

beforeEach(() => {
  invalidateQueries.mockClear();
});

describe('useAppsOnAgentExit', () => {
  it('refreshes the app queries when agent mode closes', () => {
    leaveAgentMode();

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: [BoardScopedQuery.LIST_MY_APPS],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: [BoardScopedQuery.APP_DIR],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: [BoardScopedQuery.APP_DEFAULT_FILE],
    });
  });

  it('does not refresh on mount or on entering agent mode', () => {
    const { rerender } = renderHook(
      (active: boolean) => useAppsOnAgentExit(active),
      { initialProps: false, wrapper },
    );
    rerender(true);

    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('refreshes again on the next round trip', () => {
    const { rerender } = renderHook(
      (active: boolean) => useAppsOnAgentExit(active),
      { initialProps: false, wrapper },
    );

    rerender(true);
    rerender(false);
    rerender(true);
    rerender(false);

    expect(invalidateQueries).toHaveBeenCalledTimes(6); // three keys per round trip
  });
});
