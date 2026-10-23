import {
  edgeImpulseLoginWithBrowser as loginWithBrowser,
  getEIAccessToken as getAccessToken,
  getEIAuthClient,
  isAuthenticatedEI,
  logoutEI as _logout,
  retrieveEIUser as retrieveUser,
} from '@cloud-editor-mono/domain/src/services/services-by-app/app-lab';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { EdgeImpulseContextValue } from './edgeImpulseContext';

export function useEdgeImpulse(): EdgeImpulseContextValue {
  const queryClient = useQueryClient();

  const { data: eiClient } = useQuery({
    queryKey: ['ei-auth-init'],
    queryFn: getEIAuthClient,
  });

  const { data: token } = useQuery({
    queryKey: ['ei-token'],

    queryFn: async () => {
      try {
        return await getAccessToken();
      } catch (e) {
        return null;
      }
    },

    enabled: !!eiClient,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const getTokenDone = Boolean(token || token === '');

  const { data: userIsAuthenticated } = useQuery({
    queryKey: ['ei-auth-check'],
    queryFn: isAuthenticatedEI,
    enabled: getTokenDone,
  });

  const { data: user } = useQuery({
    queryKey: ['ei-user', token],

    queryFn: async () => {
      return retrieveUser();
    },

    enabled: getTokenDone && userIsAuthenticated === true,
  });

  const { mutateAsync: login, isPending: isLoginLoading } = useMutation({
    mutationFn: () => loginWithBrowser(),
    onSuccess: async () => {
      queryClient.invalidateQueries({
        queryKey: ['ei-token'],
      });
      queryClient.invalidateQueries({
        queryKey: ['ei-user'],
      });
      queryClient.invalidateQueries({
        queryKey: ['ei-auth-check'],
      });
    },
  });

  const { mutateAsync: logout } = useMutation({
    mutationFn: async () => {
      return _logout();
    },
    onSuccess: async () => {
      queryClient.setQueryData(['ei-token'], null);
      queryClient.setQueryData(['ei-user', null], null);
      queryClient.setQueryData(['ei-auth-check'], false);
    },
  });

  const isAuthenticated = !!userIsAuthenticated;

  return useMemo(
    () => ({
      user,
      login,
      isLoginLoading,
      logout,
      isAuthenticated,
    }),
    [user, login, isLoginLoading, logout, isAuthenticated],
  );
}
