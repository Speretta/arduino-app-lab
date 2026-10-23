import { EventSourceHandlers, getEventSource } from '../fetch-event-source';
import { getAppLogsStreamV1Request } from './orchestratorApi';

vi.mock('../fetch', () => ({
  httpDelete: vi.fn(),
  httpDeleteRaw: vi.fn(),
  httpGet: vi.fn(),
  httpGetRaw: vi.fn(),
  httpPatch: vi.fn(),
  httpPatchRaw: vi.fn(),
  httpPost: vi.fn(),
  httpPostRaw: vi.fn(),
  httpPut: vi.fn(),
  httpPutRaw: vi.fn(),
}));

vi.mock('../fetch-event-source', () => ({
  getEventSource: vi.fn(),
  postEventSource: vi.fn(),
  putEventSource: vi.fn(),
}));

vi.mock('../websocket', () => ({
  getWebSocket: vi.fn(),
}));

const ORIGIN = 'http://localhost:8800';
const APP_ID = 'app-1';

/** Nothing listens to the stream here: only the request is asserted. */
const handlers: EventSourceHandlers = {
  onopen: vi.fn(),
  onmessage: vi.fn(),
  onclose: vi.fn(),
  onerror: vi.fn(),
};

const getEventSourceMock = vi.mocked(getEventSource);

const requestedUrl = (): URL =>
  new URL(getEventSourceMock.mock.calls[0][0].url);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the app log stream', () => {
  it('opens the log endpoint of the app it was given', async () => {
    await getAppLogsStreamV1Request(APP_ID, handlers, undefined, ORIGIN);

    const url = requestedUrl();

    expect(url.origin).toBe(ORIGIN);
    expect(url.pathname).toBe(`/v1/apps/${APP_ID}/logs`);
  });

  it('asks for the main, bricks and app streams', async () => {
    await getAppLogsStreamV1Request(APP_ID, handlers, undefined, ORIGIN);

    expect(requestedUrl().searchParams.get('filter')).toBe('main,bricks,app');
  });

  // The Python console tab is created by the first log line that arrives, and
  // an app that dies on a startup error writes its whole traceback before this
  // stream opens. A stream that replays nothing leaves the user with no
  // console and no error. Any non-zero tail keeps that history; the number
  // itself is free to change.
  it('asks for log history, not only the lines written after it connects', async () => {
    await getAppLogsStreamV1Request(APP_ID, handlers, undefined, ORIGIN);

    const tail = Number(requestedUrl().searchParams.get('tail'));

    expect(tail).toBeGreaterThan(0);
  });

  it('hands the stream the handlers and abort controller it was given', async () => {
    const abortController = new AbortController();

    await getAppLogsStreamV1Request(APP_ID, handlers, abortController, ORIGIN);

    expect(getEventSourceMock).toHaveBeenCalledWith(
      expect.objectContaining({ handlers, abortController }),
    );
  });
});
