import { FetchEventSourceInit } from '@microsoft/fetch-event-source';

export const SERVER_CLOSED_ERROR_CODE = 'SERVER_CLOSED';

export interface EventSourceHandlers {
  onopen: FetchEventSourceInit['onopen'];
  onmessage: FetchEventSourceInit['onmessage'];
  onclose: FetchEventSourceInit['onclose'];
  onerror: FetchEventSourceInit['onerror'];
}

export interface EventSourceOptions {
  url: string;
  handlers: EventSourceHandlers;
  token?: string;
  abortController?: AbortController;
  headers?: FetchEventSourceInit['headers'];
}

export interface EventSourceOptionsWithBody extends EventSourceOptions {
  body?: object;
}
