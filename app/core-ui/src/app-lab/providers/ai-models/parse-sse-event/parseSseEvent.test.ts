import { StreamEventType } from '@cloud-editor-mono/infrastructure';
import { EventSourceMessage } from '@microsoft/fetch-event-source';

import { parseSseEvent } from './parseSseEvent';

const sse = (event: string, data: string): EventSourceMessage => ({
  id: '',
  event,
  data,
});

/** The `done` payload of a real install, as `orchestrator.NewAIModelItem` builds it. */
const INSTALLED_MODEL = {
  id: 'llamacpp:unsloth/SmolLM2-135M-Instruct-GGUF/SmolLM2-135M-Instruct-Q4_K_M',
  id_decoded:
    'llamacpp:unsloth/SmolLM2-135M-Instruct-GGUF/SmolLM2-135M-Instruct-Q4_K_M',
  name: 'unsloth/SmolLM2-135M-Instruct-GGUF/SmolLM2-135M-Instruct-Q4_K_M',
  description: '',
  runner: '',
  brick_ids: ['arduino:llm'],
  is_builtin: false,
  origin: 'user',
  size: 105455288,
  status: 'installed',
};

describe('parseSseEvent', () => {
  describe('events that carry nothing usable', () => {
    // The daemon writes `event: heartbeat\n\n` — no `data:` line at all. These
    // must be ignored rather than thrown on: an exception out of `onmessage`
    // aborts the stream and re-issues the request, restarting the install.
    it('ignores a payload-less keep-alive', () => {
      expect(parseSseEvent(sse('heartbeat', ''))).toBeUndefined();
    });

    it('ignores an unknown event type', () => {
      expect(parseSseEvent(sse('something-new', '{"a":1}'))).toBeUndefined();
    });

    // Sent by the render layer after SERVER_CLOSED, on every stream close.
    it('ignores the stream-close event', () => {
      expect(
        parseSseEvent(sse(StreamEventType.Close, '"Stream closed by server"')),
      ).toBeUndefined();
    });
  });

  describe('message', () => {
    it('reads the message out of the payload', () => {
      expect(
        parseSseEvent(
          sse(StreamEventType.Message, '{"message":"Downloading to: /models"}'),
        ),
      ).toEqual({
        event: StreamEventType.Message,
        message: 'Downloading to: /models',
      });
    });

    it('accepts a bare string payload', () => {
      expect(
        parseSseEvent(sse(StreamEventType.Message, '"download complete"')),
      ).toEqual({
        event: StreamEventType.Message,
        message: 'download complete',
      });
    });

    it('ignores a message that is not a string', () => {
      expect(
        parseSseEvent(sse(StreamEventType.Message, '{"message":42}')),
      ).toBeUndefined();
    });
  });

  describe('progress', () => {
    // The daemon sends current/total too; nothing reads them, so only the
    // percentage and the file name survive parsing.
    it('keeps the percentage and file name from a full daemon payload', () => {
      expect(
        parseSseEvent(
          sse(
            StreamEventType.Progress,
            '{"name":"SmolLM2-135M-Instruct-Q4_K_M.gguf","current":75876627,"total":105454144,"progress":71.95}',
          ),
        ),
      ).toEqual({
        event: StreamEventType.Progress,
        progress: 71.95,
        name: 'SmolLM2-135M-Instruct-Q4_K_M.gguf',
      });
    });

    it('accepts a zero percentage', () => {
      expect(
        parseSseEvent(sse(StreamEventType.Progress, '{"progress":0}')),
      ).toEqual({ event: StreamEventType.Progress, progress: 0 });
    });

    it('ignores a payload with no numeric progress', () => {
      expect(
        parseSseEvent(
          sse(StreamEventType.Progress, '{"name":"x","progress":"71.95"}'),
        ),
      ).toBeUndefined();
    });
  });

  describe('error', () => {
    // The daemon forwards `GetError() string` with no envelope, and
    // `internal/render/sse.go` runs every payload through `json.Encode`, so a
    // downloader failure lands as a quoted JSON string rather than an object.
    // Reading `.code`/`.message` off that yields `undefined`, which is how this
    // whole class of error used to disappear silently.
    it('reads a downloader error sent as a JSON string', () => {
      const message =
        "Hugging Face model repository 'unsloth/nope' does not exist, or is not public.";

      expect(
        parseSseEvent(sse(StreamEventType.Error, JSON.stringify(message))),
      ).toEqual({ event: StreamEventType.Error, message });
    });

    it('falls back to the raw data when the payload is not JSON', () => {
      expect(parseSseEvent(sse(StreamEventType.Error, 'plain text'))).toEqual({
        event: StreamEventType.Error,
        message: 'plain text',
      });
    });

    it('reads a daemon error sent as an object', () => {
      expect(
        parseSseEvent(
          sse(
            StreamEventType.Error,
            '{"code":"INTERNAL_SERVER_ERROR","message":"download named no model"}',
          ),
        ),
      ).toEqual({
        event: StreamEventType.Error,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'download named no model',
      });
    });

    // The caller filters on these two codes, so they have to survive parsing.
    it.each(['SERVER_CLOSED', 'insufficient_storage'])(
      'preserves the %s code',
      (code) => {
        expect(
          parseSseEvent(sse(StreamEventType.Error, JSON.stringify({ code }))),
        ).toEqual({ event: StreamEventType.Error, code, message: '' });
      },
    );
  });

  describe('done', () => {
    it('reads the installed model', () => {
      expect(
        parseSseEvent(
          sse(StreamEventType.Done, JSON.stringify(INSTALLED_MODEL)),
        ),
      ).toEqual({ event: StreamEventType.Done, model: INSTALLED_MODEL });
    });

    // A `done` that carries no model reports no completion: the stream close
    // then fails the download, rather than an install claiming a model it was
    // never told about.
    it('ignores a done payload that is not a model', () => {
      expect(
        parseSseEvent(sse(StreamEventType.Done, '"download complete"')),
      ).toBeUndefined();
    });

    // The daemon reports `id` base64url encoded and the plain spelling as
    // `id_decoded`. Neither is rewritten here: `id` is what a later request
    // names the model with, so it travels on exactly as it arrived.
    it('keeps both spellings the daemon reports', () => {
      const encoded = {
        ...INSTALLED_MODEL,
        id: 'bGxhbWFjcHA6dW5zbG90aC9TbW9sTE0yLTEzNU0tSW5zdHJ1Y3QtR0dVRi9TbW9sTE0yLTEzNU0tSW5zdHJ1Y3QtUTRfS19N',
      };

      expect(
        parseSseEvent(sse(StreamEventType.Done, JSON.stringify(encoded))),
      ).toEqual({
        event: StreamEventType.Done,
        model: encoded,
      });
    });
  });
});
