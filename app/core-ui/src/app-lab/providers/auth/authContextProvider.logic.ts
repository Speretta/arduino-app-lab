import {
  AUTH_ACTION_ATTEMPTED,
  getAccessToken,
  getAuthClientSync,
  getAuthState,
  isAuthenticated,
  loginWithBrowser,
  logout as _logout,
  NO_AUTH_TOKEN_PLACEHOLDER,
  retrieveAuth0User,
} from '@cloud-editor-mono/domain/src/services/services-by-app/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import { useCallback, useContext, useMemo, useState } from 'react';
import { useCopyToClipboard } from 'react-use';

import { sendAppLabNotification } from '../../features/notifications';
import { get, set } from '../../services/persistentStore';
import { EdgeImpulseContext } from '../edge-impulse/edgeImpulseContext';
import { AuthContextValue } from './authContext';

const client = getAuthClientSync();

export function useAuth(): AuthContextValue {
  const { logout: edgeImpulseLogout, user: edgeImpulseUser } =
    useContext(EdgeImpulseContext);

  const queryClient = useQueryClient();
  const [skipped, setSkipped] = useState<boolean>(false);

  const [_, copyToClipboard] = useCopyToClipboard();

  const isAuthRoute = useRouterState({
    select: (s) => s.location.pathname === '/examples',
  });

  const enableAuthStateQuery = isAuthRoute && !skipped && !!client;
  const { data: authState } = useQuery({
    queryKey: ['auth-state', isAuthRoute],

    queryFn: () => {
      return getAuthState();
    },

    enabled: enableAuthStateQuery,
  });

  const enableTokenQuery = !skipped && !!client;
  const { data: token } = useQuery({
    queryKey: ['auth-token', isAuthRoute, authState],

    queryFn: () => {
      return getAccessToken(undefined, true, true);
    },

    enabled: enableTokenQuery,
  });
  const getTokenDone = Boolean(token && token !== NO_AUTH_TOKEN_PLACEHOLDER);

  const enableAuthCheckQuery = !skipped && !!client && getTokenDone;
  const { data: userIsAuthenticated } = useQuery({
    queryKey: ['auth-check', isAuthRoute, token],

    queryFn: () => {
      return isAuthenticated();
    },

    enabled: enableAuthCheckQuery,
  });

  const enableAutoFetchProfileQuery =
    getTokenDone && userIsAuthenticated === true;
  const { data: autoFetchedProfile } = useQuery({
    queryKey: ['auth-user', isAuthRoute, token],

    queryFn: () => {
      return retrieveAuth0User();
    },

    enabled: enableAutoFetchProfileQuery,
  });

  const {
    mutateAsync: login,
    isPending: isLoginLoading,
    isError: isLoginError,
  } = useMutation({
    mutationFn: async (_params?: { isFromAccount: boolean }) => {
      await loginWithBrowser(false);
    },
    onSuccess: async (_, params) => {
      queryClient.invalidateQueries({
        queryKey: ['auth-token'],
      });
      queryClient.invalidateQueries({
        queryKey: ['auth-check'],
      });
      queryClient.invalidateQueries({
        queryKey: ['auth-user'],
      });
      queryClient.invalidateQueries({
        queryKey: ['auth-state'],
      });

      if (params && params.isFromAccount) {
        sendAppLabNotification({
          message: `You're logged in with your Arduino account`,
          variant: 'success',
        });
      }
    },
    onError: (error) => {
      sendAppLabNotification({
        message: `${error}`,
        variant: 'error',
        actions: [
          {
            text: 'Copy to clipboard',
            onClick: () => copyToClipboard(`${error}`),
          },
        ],
      });
    },
  });

  const {
    mutateAsync: logout,
    isPending: isLogoutLoading,
    isError: isLogoutError,
  } = useMutation({
    mutationFn: async () => {
      return _logout();
    },
    onSuccess: async () => {
      queryClient.setQueryData(
        ['auth-token', isAuthRoute, authState],
        NO_AUTH_TOKEN_PLACEHOLDER,
      );
      queryClient.setQueryData(['auth-check', isAuthRoute, token], false);
      queryClient.setQueryData(['auth-user', isAuthRoute, token], null);
      queryClient.setQueryData(['auth-state', isAuthRoute], null);

      if (edgeImpulseUser) {
        await edgeImpulseLogout();
      }
    },
  });

  const { mutate: dismissWelcomePage } = useMutation({
    mutationFn: () => set('welcome-page-dismissed', true),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['welcome-page-dismissed'],
      });
    },
  });

  const { data: isWelcomePageDismissed } = useQuery({
    queryKey: ['welcome-page-dismissed'],

    queryFn: async () => {
      const data = await get('welcome-page-dismissed');
      return data ?? null;
    },
  });

  const skip = useCallback(async (): Promise<void> => {
    await set(AUTH_ACTION_ATTEMPTED, true);
    setSkipped(true);
  }, []);

  return useMemo(
    () => ({
      user: autoFetchedProfile,
      login,
      isLoginLoading,
      isLoginError,
      logout,
      isLogoutLoading,
      isLogoutError,
      skip,
      skipped,
      dismissWelcomePage,
      isWelcomePageDismissed,
    }),
    [
      autoFetchedProfile,
      login,
      isLoginLoading,
      isLoginError,
      logout,
      isLogoutLoading,
      isLogoutError,
      skip,
      skipped,
      dismissWelcomePage,
      isWelcomePageDismissed,
    ],
  );
}
