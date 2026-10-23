import {
  ArduinoUser,
  Auth0ClientOptions,
  AuthClient,
  GetTokenSilentlyOptions,
  RedirectLoginOptions,
} from '@bcmi-labs/art-auth';
import { Config } from '@cloud-editor-mono/common';

import { AppState } from './auth0.type';
import { deploymentPath } from './utils';

export async function createAuth0Instance(
  options: Auth0ClientOptions,
  timeout: number,
): Promise<AuthClient> {
  const config = {
    authorizeTimeoutInSeconds: timeout,
    useRefreshTokens: false,
    ...options,
  };

  const auth0 = deploymentPath.customKey
    ? await AuthClient.createCloudClient(
        {
          config,
        },
        deploymentPath.customKey,
        // The customization API is reachable through the same per-environment
        // base URL as the rest of the cloud APIs, so reuse API_URL (which the
        // host app injects in the component case) instead of a dedicated var.
        { API_URL: Config.API_URL },
      ).catch(() => AuthClient.create({ config }))
    : AuthClient.create({
        config,
      });

  return auth0;
}

export function createAuth0InstanceSync(
  options: Auth0ClientOptions,
): AuthClient {
  return AuthClient.create({
    config: { ...options, useRefreshTokens: true },
  });
}

export async function getAuth0AppState(
  client: AuthClient,
): Promise<AppState | null> {
  try {
    const callbackResponse = await client.handleRedirectCallback();
    return callbackResponse.appState;
  } catch {
    return null;
  }
}

export async function loginAuth0WithRedirect(
  client: AuthClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: RedirectLoginOptions<any>,
): Promise<void> {
  client.loginWithRedirect(options);
}

export async function getAuth0User(
  client: AuthClient,
): Promise<ArduinoUser | null> {
  const user = await client.getUser();
  return user ? user : null;
}

export function auth0IsAuthenticated(client: AuthClient): Promise<boolean> {
  return client.isAuthenticated();
}

export function getAuth0TokenSilently(
  client: AuthClient,
  options?: GetTokenSilentlyOptions,
): Promise<string> {
  return client.getTokenSilently(options);
}
