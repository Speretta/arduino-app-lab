import { getEventSource } from './fetchEventSource';
import { EventSourceHandlers } from './fetchEventSource.type';

const URL = 'http://localhost:8800/v1/apps/app-1/logs';

const streamResponse = (body: string): Response =>
  new Response(
    new ReadableStream({
      start(controller): void {
        controller.enqueue(new TextEncoder().encode(body));
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );

const handlers = (): EventSourceHandlers => ({
  onopen: vi.fn(),
  onmessage: vi.fn(),
  onclose: vi.fn(),
  onerror: vi.fn(),
});

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('getEventSource', () => {
  // The app log stream replays its tail on every connect, so a reconnect after
  // the server ends the stream would print that history a second time.
  it('does not reconnect after the server closes the stream', async () => {
    fetchMock.mockResolvedValue(
      streamResponse('event: message\ndata: {"message":"bye"}\n\n'),
    );
    const streamHandlers = handlers();

    await getEventSource({ url: URL, handlers: streamHandlers });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(streamHandlers.onmessage).toHaveBeenCalledTimes(1);
    expect(streamHandlers.onclose).toHaveBeenCalledTimes(1);
    expect(streamHandlers.onerror).not.toHaveBeenCalled();
  });

  it('retries a stream the server could not open', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValue(streamResponse(''));
    const streamHandlers = handlers();

    const stream = getEventSource({ url: URL, handlers: streamHandlers });
    await vi.advanceTimersByTimeAsync(1000);
    await stream;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(streamHandlers.onerror).toHaveBeenCalledTimes(1);
  });

  it('doubles the wait before each further retry', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValue(streamResponse(''));
    const streamHandlers = handlers();

    const stream = getEventSource({ url: URL, handlers: streamHandlers });
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1);
    await stream;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('stops retrying after five failed attempts', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }));

    const stream = getEventSource({ url: URL, handlers: handlers() });
    const outcome = expect(stream).rejects.toThrow('Max retries exceeded');
    await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000 + 8000 + 16000);
    await outcome;

    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});
