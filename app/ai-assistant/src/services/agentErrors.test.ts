import { describe, expect, it } from 'vitest';

import { isNetworkError } from './agentErrors';

// A turn that dies in transport reads nothing like one the provider rejected, and the user can act on
// it (reconnect) — so the classification decides whether the banner blames the connection.
describe('isNetworkError', () => {
  it.each([
    'fetch failed',
    'TypeError: Failed to fetch',
    'API Error: Connection error.',
    'connect ECONNREFUSED 127.0.0.1:443',
    'getaddrinfo ENOTFOUND api.anthropic.com',
    'getaddrinfo EAI_AGAIN api.anthropic.com',
    'read ECONNRESET',
    'socket hang up',
    'connect ETIMEDOUT',
    'connect ENETUNREACH',
    'net::ERR_INTERNET_DISCONNECTED',
  ])('reports a transport failure: %s', (message) => {
    expect(isNetworkError(message)).toBe(true);
  });

  it.each([
    'Invalid API key · Please run /login',
    'rate limit exceeded, retry after 60s',
    'The session was not found',
    'Internal error: tool "board_exec" is not allowed',
    '',
  ])('leaves the agent to explain its own failure: %s', (message) => {
    expect(isNetworkError(message)).toBe(false);
  });
});
