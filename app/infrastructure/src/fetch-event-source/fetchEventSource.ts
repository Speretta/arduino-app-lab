import {
  fetchEventSource,
  FetchEventSourceInit,
} from '@microsoft/fetch-event-source';

import {
  EventSourceHandlers,
  EventSourceOptions,
  EventSourceOptionsWithBody,
} from './fetchEventSource.type';

const maxRetries = 5;
const baseDelay = 1000; // 1 second

const METHOD_NOT_ALLOWED = 405;

export class EventSourceFatalError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
    this.name = 'EventSourceFatalError';
  }
}

// A daemon too old to implement the endpoint answers the request with 405.
export function isUnsupportedEndpointError(
  error: unknown,
): error is EventSourceFatalError {
  return (
    error instanceof EventSourceFatalError &&
    error.status === METHOD_NOT_ALLOWED
  );
}

class RetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableError';
  }
}

async function commonOnOpen(res: Response): Promise<void> {
  if (!res.ok) {
    if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      throw new EventSourceFatalError(res.status);
    } else {
      throw new RetryableError(`Unexpected response status: ${res.status}`);
    }
  }
}

function getCommonOnError(): (err: Error) => number {
  let tries = 0;
  return (err: Error): number => {
    if (err instanceof EventSourceFatalError) {
      throw err;
    }

    tries += 1;
    if (tries > maxRetries) {
      throw new Error('Max retries exceeded');
    }

    return baseDelay * 2 ** (tries - 1);
  };
}

function addCommonHandlers(handlers: EventSourceHandlers): EventSourceHandlers {
  const commonOnError = getCommonOnError();
  return {
    ...handlers,
    async onopen(res: Response): Promise<void> {
      await handlers.onopen?.(res);
      await commonOnOpen(res);
    },
    onerror: (err: Error): number => {
      handlers.onerror?.(err);
      return commonOnError(err);
    },
  };
}

async function sendEventSource(
  method: 'GET' | 'POST' | 'PUT',
  { url, handlers, token, abortController, headers }: EventSourceOptions,
  body?: object | FormData,
): Promise<void> {
  const options: FetchEventSourceInit = {
    method,
    ...addCommonHandlers(handlers),
    openWhenHidden: true,
  };

  if (body instanceof FormData) {
    options.body = body;
  } else if (body) {
    options.body = JSON.stringify(body);
  }

  if (token) {
    options.headers = {
      Authorization: `Bearer ${token}`,
    };
  }

  if (abortController) {
    options.signal = abortController.signal;
  }

  if (headers) {
    options.headers = {
      ...options.headers,
      ...headers,
    };
  }

  return fetchEventSource(url, options);
}

export async function getEventSource(
  options: EventSourceOptions,
): Promise<void> {
  return sendEventSource('GET', options);
}

export async function postEventSource({
  body = {},
  ...options
}: EventSourceOptionsWithBody): Promise<void> {
  return sendEventSource('POST', options, body);
}

export async function putEventSource({
  body = {},
  ...options
}: EventSourceOptionsWithBody): Promise<void> {
  return sendEventSource('PUT', options, body);
}
