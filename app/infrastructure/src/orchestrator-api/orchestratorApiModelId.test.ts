import {
  httpDelete,
  httpGet,
  httpPatchRaw,
  httpPost,
  httpPut,
  httpPutRaw,
  RawResponse,
} from '../fetch';
import {
  EventSourceHandlers,
  postEventSource,
  putEventSource,
} from '../fetch-event-source';
import {
  addAppBrickV1Request,
  deleteAIModelV1Request,
  downloadAIModelV1Request,
  getAIModelsV1Request,
  installAIModelV1Request,
  installEIModelV1Request,
  renameAppCustomBrickV1Request,
  updateAppBrickV1Request,
} from './orchestratorApi';
import { AIModelItem } from './orchestratorApi.type';

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

/** A linked Hugging Face model: the id holds slashes, so the daemon encodes it. */
const PLAIN_ID =
  'llamacpp:unsloth/SmolLM2-135M-Instruct-GGUF/SmolLM2-135M-Instruct-Q4_K_M';
const ENCODED_ID =
  'bGxhbWFjcHA6dW5zbG90aC9TbW9sTE0yLTEzNU0tSW5zdHJ1Y3QtR0dVRi9TbW9sTE0yLTEzNU0tSW5zdHJ1Y3QtUTRfS19N';

const ORIGIN = 'http://localhost:8800';

/** A model as a current daemon reports it: `id` addressable, `id_decoded` plain. */
const model = (overrides: Partial<AIModelItem> = {}): AIModelItem => ({
  id: ENCODED_ID,
  id_decoded: PLAIN_ID,
  name: 'SmolLM2-135M-Instruct',
  description: '',
  runner: '',
  brick_ids: ['arduino:llm'],
  is_builtin: false,
  origin: 'user',
  status: 'installed',
  ...overrides,
});

const httpGetMock = vi.mocked(httpGet);
const httpDeleteMock = vi.mocked(httpDelete);
const httpPutRawMock = vi.mocked(httpPutRaw);
const httpPatchRawMock = vi.mocked(httpPatchRaw);
const httpPutMock = vi.mocked(httpPut);
const httpPostMock = vi.mocked(httpPost);
const putEventSourceMock = vi.mocked(putEventSource);
const postEventSourceMock = vi.mocked(postEventSource);

/** Only the status is read, so a bare object stands in for a raw response. */
const ok = { status: 200 } as RawResponse;

/** Nothing listens to the stream here: only the url and body are asserted. */
const handlers: EventSourceHandlers = {
  onopen: vi.fn(),
  onmessage: vi.fn(),
  onclose: vi.fn(),
  onerror: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the model id on the wire', () => {
  describe('the listing is reported as it arrives', () => {
    it('keeps the id of every model it lists', async () => {
      httpGetMock.mockResolvedValue({
        models: [model(), model({ id: 'enc-2', id_decoded: 'plain-2' })],
      });

      const result = await getAIModelsV1Request(ORIGIN);

      expect(result.models?.map((m) => m.id)).toEqual([ENCODED_ID, 'enc-2']);
    });

    it('leaves every field of a listed model alone', async () => {
      httpGetMock.mockResolvedValue({ models: [model()] });

      const [listed] = (await getAIModelsV1Request(ORIGIN)).models ?? [];

      expect(listed).toEqual(model());
    });

    it('keeps the fields the listing carries beside the models', async () => {
      httpGetMock.mockResolvedValue({ models: [model()], total: 1 });

      expect(await getAIModelsV1Request(ORIGIN)).toMatchObject({ total: 1 });
    });

    it('survives a listing that names no models', async () => {
      httpGetMock.mockResolvedValue({});

      expect((await getAIModelsV1Request(ORIGIN)).models).toBeUndefined();
    });

    // The endpoint no longer filters by source: the one list holds every
    // provider, and a query would drop the models this app now shows.
    it('asks for the whole list', async () => {
      httpGetMock.mockResolvedValue({ models: [] });

      await getAIModelsV1Request(ORIGIN);

      expect(httpGetMock).toHaveBeenCalledWith({
        url: ORIGIN,
        endpoint: '/v1/models',
      });
    });
  });

  describe('an Edge Impulse install is reported as it arrives', () => {
    it('keeps the id of the model it installed', async () => {
      httpPutMock.mockResolvedValue(
        model({ origin: 'edge-impulse-user-project' }),
      );

      const result = await installEIModelV1Request('key', '1', '2', ORIGIN);

      expect(result.id).toBe(ENCODED_ID);
    });
  });

  describe('a path naming a model sends the id as it arrived', () => {
    it('names an uninstall with the id it was given', async () => {
      httpDeleteMock.mockResolvedValue({});

      await deleteAIModelV1Request(ENCODED_ID, ORIGIN);

      expect(httpDeleteMock).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: `/v1/models/${ENCODED_ID}` }),
      );
    });

    it('keeps the flag on a forced uninstall', async () => {
      httpDeleteMock.mockResolvedValue({});

      await deleteAIModelV1Request(ENCODED_ID, ORIGIN, true);

      expect(httpDeleteMock).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: `/v1/models/${ENCODED_ID}`,
          params: { force: 'true' },
        }),
      );
    });

    it('names a declared install with the id it was given', async () => {
      await installAIModelV1Request(ENCODED_ID, handlers, undefined, ORIGIN);

      expect(putEventSourceMock).toHaveBeenCalledWith({
        url: `${ORIGIN}/v1/models/${ENCODED_ID}`,
        handlers,
        abortController: undefined,
      });
    });

    // An older daemon reports a single plain id and takes that same form back,
    // so an id is never rewritten on its way onto a path.
    it('names a path with an older daemon plain id untouched', async () => {
      httpDeleteMock.mockResolvedValue({});

      await deleteAIModelV1Request('llamacpp:Qwen3.5-2B-Q4_K_M', ORIGIN);

      expect(httpDeleteMock).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: '/v1/models/llamacpp:Qwen3.5-2B-Q4_K_M',
        }),
      );
    });

    // A linked download names a url, not an id, so the url must reach the
    // daemon exactly as typed.
    it('posts a linked download url unencoded', async () => {
      const modelUrl =
        'https://huggingface.co/unsloth/SmolLM2-135M-Instruct-GGUF/resolve/main/SmolLM2-135M-Instruct-Q4_K_M.gguf';

      await downloadAIModelV1Request(modelUrl, handlers, undefined, ORIGIN);

      expect(postEventSourceMock).toHaveBeenCalledWith({
        url: `${ORIGIN}/v1/models`,
        handlers,
        body: { model_url: modelUrl },
        abortController: undefined,
      });
    });

    it('carries the mmproj url only when there is one', async () => {
      await downloadAIModelV1Request(
        'https://huggingface.co/repo/model',
        handlers,
        undefined,
        ORIGIN,
        'https://huggingface.co/repo/mmproj',
      );

      expect(postEventSourceMock).toHaveBeenCalledWith({
        url: `${ORIGIN}/v1/models`,
        handlers,
        body: {
          model_url: 'https://huggingface.co/repo/model',
          mmproj_url: 'https://huggingface.co/repo/mmproj',
        },
        abortController: undefined,
      });
    });
  });

  describe('a brick request sends the model as it arrived', () => {
    it('names the model an add carries with the id it was given', async () => {
      httpPutRawMock.mockResolvedValue(ok);

      await addAppBrickV1Request(
        'app-1',
        'arduino:llm',
        { model: ENCODED_ID },
        ORIGIN,
      );

      expect(httpPutRawMock).toHaveBeenCalledWith(
        expect.objectContaining({ body: { model: ENCODED_ID } }),
      );
    });

    it('names the model an update carries with the id it was given', async () => {
      httpPatchRawMock.mockResolvedValue(ok);

      await updateAppBrickV1Request(
        'app-1',
        'arduino:llm',
        { model: ENCODED_ID },
        ORIGIN,
      );

      expect(httpPatchRawMock).toHaveBeenCalledWith(
        expect.objectContaining({ body: { model: ENCODED_ID } }),
      );
    });

    it('leaves the other fields of the request alone', async () => {
      httpPatchRawMock.mockResolvedValue(ok);

      await updateAppBrickV1Request(
        'app-1',
        'arduino:llm',
        { model: ENCODED_ID, variables: { k: 'v' } },
        ORIGIN,
      );

      expect(httpPatchRawMock).toHaveBeenCalledWith(
        expect.objectContaining({
          body: {
            model: ENCODED_ID,
            variables: { k: 'v' },
          },
        }),
      );
    });

    it('carries an older daemon plain id untouched', async () => {
      httpPatchRawMock.mockResolvedValue(ok);

      await updateAppBrickV1Request(
        'app-1',
        'arduino:llm',
        { model: 'llamacpp:Qwen3.5-2B-Q4_K_M' },
        ORIGIN,
      );

      expect(httpPatchRawMock).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { model: 'llamacpp:Qwen3.5-2B-Q4_K_M' },
        }),
      );
    });

    it('leaves a request naming no model alone', async () => {
      httpPatchRawMock.mockResolvedValue(ok);

      await updateAppBrickV1Request('app-1', 'arduino:llm', {}, ORIGIN);

      expect(httpPatchRawMock).toHaveBeenCalledWith(
        expect.objectContaining({ body: {} }),
      );
    });
  });

  // Nothing between the listing and a request rewrites an id, which is what
  // makes both daemon versions work: whatever spelling arrives goes back.
  it.each([
    ['a current daemon', model()],
    ['an older daemon', { ...model(), id: PLAIN_ID, id_decoded: '' }],
  ])('round-trips an id from the listing of %s', async (_case, listing) => {
    httpGetMock.mockResolvedValue({ models: [listing] });
    httpPatchRawMock.mockResolvedValue(ok);

    const [listed] = (await getAIModelsV1Request(ORIGIN)).models ?? [];
    await updateAppBrickV1Request(
      'app-1',
      'arduino:llm',
      { model: listed.id },
      ORIGIN,
    );

    expect(httpPatchRawMock).toHaveBeenCalledWith(
      expect.objectContaining({ body: { model: listing.id } }),
    );
  });

  describe('renameAppCustomBrick returns the new brick ID', () => {
    it('returns the new brick ID from the response', async () => {
      httpPostMock.mockResolvedValue({ id: 'my_renamed_brick' });

      const result = await renameAppCustomBrickV1Request(
        'app-1',
        'old_brick',
        { name: 'My Renamed Brick' },
        ORIGIN,
      );

      expect(result).toBe('my_renamed_brick');
      expect(httpPostMock).toHaveBeenCalledWith({
        url: ORIGIN,
        endpoint: '/v1/apps/app-1/bricks/old_brick/rename',
        body: { name: 'My Renamed Brick' },
      });
    });

    it('returns null when the response has no id', async () => {
      httpPostMock.mockResolvedValue({});

      const result = await renameAppCustomBrickV1Request(
        'app-1',
        'old_brick',
        { name: 'My Renamed Brick' },
        ORIGIN,
      );

      expect(result).toBeNull();
    });

    it('returns null when the response is undefined', async () => {
      httpPostMock.mockResolvedValue(undefined);

      const result = await renameAppCustomBrickV1Request(
        'app-1',
        'old_brick',
        { name: 'My Renamed Brick' },
        ORIGIN,
      );

      expect(result).toBeNull();
    });
  });
});
