import { GenericError } from '@auth0/auth0-spa-js';
import { useQuery } from '@tanstack/react-query';
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import type { AuthClient } from '../authClient';
import type { ArduinoUser, ArduinoUserEnrichedData } from '../types';
import type { AuthContextType } from './context';
import { AuthContext } from './context';

export const unauthenticatedUser: ArduinoUser = {
  name: '',
  'http://arduino.cc/id': '',
  'http://arduino.cc/username': '',
  'http://arduino.cc/logins': 0,
  email: '',
  picture: '',
};

export async function checkResponse<T = unknown>(res: Response) {
  if (!res.ok) {
    const body = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    throw new Error(body.error || body.message || res.statusText);
  }

  // If content type is not JSON, return the response as is, otherwise return JSON: this avoids erroring on empty responses
  return ['json', 'type=collection'].some((key) =>
    res.headers.get('content-type')?.includes(key),
  )
    ? (res.json() as T)
    : (res as T);
}

export async function authFetch(
  input: string,
  authToken: string,
  options: RequestInit = { headers: {} },
) {
  const { headers, ...restOptions } = options;

  if (!authToken) {
    throw new Error('Authentication error');
  }

  const _headers: HeadersInit = {
    Authorization: `Bearer ${authToken}`,
    ...headers,
  };

  // If we're sending a FormData, don't set the Content-Type header.
  // See: https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest_API/Using_FormData_Objects#sending_files_using_a_formdata_object
  if (!(options.body instanceof FormData)) {
    // Pretend we're sending JSON (this is true most of the time), we can always override this later.
    Object.assign(_headers, {
      'Content-Type': 'application/json;charset=UTF-8',
    });
  }

  const _options: RequestInit = {
    headers: new Headers(_headers),
    ...restOptions,
  };

  return fetch(input, _options);
}

/** Light wrapper of auth0 provider */
export function AuthProvider(props: {
  children: React.ReactNode;
  authClient: AuthClient;
  forceLogin?: boolean;
  env: {
    API_URL: string;
  };
  onRedirectCallback?: (appState: URLSearchParams) => void;
  skipRedirectCallback?: boolean;
  onAuthenticated?: (user: ArduinoUser) => void;
  onAuthenticationError?: (error: Error | GenericError) => void | Promise<void>;
}):
  | ((error: Error | GenericError) => void | Promise<void>)
  | JSX.Element
  | undefined {
  const [client] = useState(props.authClient);
  const hasLoggedIn = useRef(false);

  const store = useSyncExternalStore<{
    user: ArduinoUser;
    isAuthenticated: boolean;
  }>(
    (cb) => {
      client.subscribe(cb);
      return () => {
        client.unsubscribe(cb);
      };
    },
    () => {
      const data = client.store;

      // Call onAuthenticated if user was not authenticated before
      if (!hasLoggedIn.current && data.isAuthenticated) {
        props.onAuthenticated?.(data.user);
        hasLoggedIn.current = true;
      }

      return data;
    },
    () => ({
      user: unauthenticatedUser,
      isAuthenticated: false,
    }),
  );

  const enrichedUser = useQuery({
    queryKey: ['enrichedUser'],
    queryFn: async () => {
      const isMinor = Boolean(store.user['http://arduino.cc/is_minor']);

      const res = await checkResponse<ArduinoUserEnrichedData>(
        await authFetch(
          `${props.env.API_URL}/users/v1/${
            isMinor
              ? 'children/byID/me'
              : `users/byID/${store.user['http://arduino.cc/id']}?scopes=private`
          }`,
          await client.getTokenSilently(),
        ),
      );

      const settings =
        (await checkResponse<Record<string, unknown>>(
          await authFetch(
            `${props.env.API_URL}/users/v1/users/settings`,
            await client.getTokenSilently(),
          ),
        ).catch(() => {})) || {}; // Ignore errors when the user has no settings

      // If user is minor, we can't unwrap private as it won't be available.
      const privateData = 'private' in res ? { ...res.private } : {};

      const userData = {
        id: res.id,
        username: res.username,
        avatar: res.avatar,
        birthday: res.birthday,
        confirmed: res.confirmed,
        created: res.created,
        name: res.name,
        ...privateData,
      };

      return { ...userData, settings };
    },
    enabled: store.isAuthenticated && store.user !== unauthenticatedUser,
  });

  const syncAuthState = useCallback(async () => {
    const us = await client.getUser();
    enrichedUser.refetch();
    return us as ArduinoUser;
  }, [enrichedUser, client]);

  const memoizedUser = useMemo(
    () => ({ ...store.user, ...enrichedUser.data }),
    [store.user, enrichedUser.data],
  );

  // Memoized context value to avoid unnecessary re-renders
  const contextValue: AuthContextType = {
    client,
    user: memoizedUser,
    isAuthenticated: true,
    syncAuthState,
  };
  return (
    <AuthContext.Provider value={contextValue}>
      {props.children}
    </AuthContext.Provider>
  );
}
