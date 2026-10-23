// @vitest-environment node
import { httpPostRaw, RawResponse } from '../fetch';
import { createAppBuildV1Request } from './orchestratorApi';

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
const BOUNDARY = '3f1c9a7e2b';
const BUILD_REQUEST = { target: 'ventunoq', build_id: 'b1' };

// The bytes hold CRLF and dashes, as a gzip archive can.
const ARCHIVE = new Uint8Array([
  0x1f, 0x8b, 0x0d, 0x0a, 0x2d, 0x2d, 0x0d, 0x0a, 0x0d, 0x0a, 0x00, 0xff,
]);

const text = (value: string): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(value);

const concat = (...chunks: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
};

// Written the way Go's multipart.Writer writes the daemon response.
const heartbeat = (first: boolean): Uint8Array<ArrayBuffer> =>
  text(
    `${first ? '' : '\r\n'}--${BOUNDARY}\r\nContent-Type: text/plain\r\n\r\n`,
  );
const lastPart = (
  headers: string,
  content: Uint8Array,
): Uint8Array<ArrayBuffer> =>
  concat(text(`\r\n--${BOUNDARY}\r\n${headers}\r\n\r\n`), content);
const jsonPart = (value: object): Uint8Array<ArrayBuffer> =>
  lastPart(
    'Content-Type: application/json',
    text(`${JSON.stringify(value)}\n`),
  );
const progress = (): Uint8Array<ArrayBuffer> =>
  concat(
    jsonPart({ event: 'progress', name: 'python environment', progress: 20 }),
    jsonPart({ event: 'message', message: 'building the python environment' }),
  );
const closing = text(`\r\n--${BOUNDARY}--\r\n`);

const respond = (body: Uint8Array<ArrayBuffer>, contentType: string): void => {
  vi.mocked(httpPostRaw).mockResolvedValue(
    new Response(body, {
      headers: { 'Content-Type': contentType },
    }) as RawResponse,
  );
};

const bytesOf = async (blob: Blob): Promise<Uint8Array> =>
  new Uint8Array(await blob.arrayBuffer());

const multipart = `multipart/mixed; boundary=${BOUNDARY}`;

const build = (): Promise<Blob> =>
  createAppBuildV1Request('app1', BUILD_REQUEST, undefined, ORIGIN);

describe('createAppBuildV1Request', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves with the archive in the last part, after the heartbeats', async () => {
    respond(
      concat(
        heartbeat(true),
        heartbeat(false),
        heartbeat(false),
        lastPart(
          'Content-Disposition: attachment; filename="app1.ard"\r\nContent-Type: application/gzip',
          ARCHIVE,
        ),
        closing,
      ),
      multipart,
    );

    const archive = await build();

    expect(await bytesOf(archive)).toEqual(ARCHIVE);
    expect(archive.type).toBe('application/gzip');
  });

  it('resolves with the archive when it is the first part', async () => {
    respond(
      concat(
        text(`--${BOUNDARY}\r\nContent-Type: application/gzip\r\n\r\n`),
        ARCHIVE,
        closing,
      ),
      `multipart/mixed; boundary="${BOUNDARY}"`,
    );

    expect(await bytesOf(await build())).toEqual(ARCHIVE);
  });

  it('rejects with the details of a failed build', async () => {
    respond(
      concat(
        heartbeat(true),
        progress(),
        jsonPart({
          event: 'error',
          code: 'INTERNAL_SERVER_ERROR',
          details: 'the build failed',
        }),
        closing,
      ),
      multipart,
    );

    await expect(build()).rejects.toThrow('the build failed');
  });

  it('rejects with the details of a failed build without an event name', async () => {
    respond(
      concat(
        heartbeat(true),
        jsonPart({
          code: 'INTERNAL_SERVER_ERROR',
          details: 'the build failed',
        }),
        closing,
      ),
      multipart,
    );

    await expect(build()).rejects.toThrow('the build failed');
  });

  it('resolves with the archive after the progress parts', async () => {
    respond(
      concat(
        heartbeat(true),
        progress(),
        heartbeat(false),
        progress(),
        lastPart('Content-Type: application/gzip', ARCHIVE),
        closing,
      ),
      multipart,
    );

    const archive = await build();

    expect(await bytesOf(archive)).toEqual(ARCHIVE);
    expect(archive.type).toBe('application/gzip');
  });

  it('resolves with an archive whose bytes hold the delimiter', async () => {
    const archive = concat(ARCHIVE, text(`\r\n--${BOUNDARY}\r\n`), ARCHIVE);
    respond(
      concat(
        heartbeat(true),
        lastPart('Content-Type: application/gzip', archive),
        closing,
      ),
      multipart,
    );

    expect(await bytesOf(await build())).toEqual(archive);
  });

  it('rejects a response that ends with a progress part', async () => {
    respond(concat(heartbeat(true), progress(), closing), multipart);

    await expect(build()).rejects.toThrow(
      'ended before the release archive was complete',
    );
  });

  it('rejects an archive that ends without the closing boundary', async () => {
    respond(
      concat(
        heartbeat(true),
        lastPart('Content-Type: application/gzip', ARCHIVE.subarray(0, 6)),
      ),
      multipart,
    );

    await expect(build()).rejects.toThrow(
      'ended before the release archive was complete',
    );
  });

  it('rejects a response that only has heartbeats', async () => {
    respond(concat(heartbeat(true), heartbeat(false), closing), multipart);

    await expect(build()).rejects.toThrow(
      'ended before the release archive was complete',
    );
  });

  it('reads the body as the archive when the daemon does not send multipart', async () => {
    respond(ARCHIVE, 'application/gzip');

    const archive = await build();

    expect(await bytesOf(archive)).toEqual(ARCHIVE);
  });
});
