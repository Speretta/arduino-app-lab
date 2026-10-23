import { AIModelItem } from '@cloud-editor-mono/infrastructure';
import { describe, expect, it } from 'vitest';

import { plainModelId } from './modelId';

/** A linked Hugging Face model: the id holds slashes, so the daemon encodes it. */
const PLAIN_ID =
  'llamacpp:unsloth/SmolLM2-135M-Instruct-GGUF/SmolLM2-135M-Instruct-Q4_K_M';
const ENCODED_ID =
  'bGxhbWFjcHA6dW5zbG90aC9TbW9sTE0yLTEzNU0tSW5zdHJ1Y3QtR0dVRi9TbW9sTE0yLTEzNU0tSW5zdHJ1Y3QtUTRfS19N';

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

describe('plainModelId', () => {
  it('takes the plain spelling the daemon reports beside the id', () => {
    expect(plainModelId(model())).toBe(PLAIN_ID);
  });

  // An older daemon reports one plain id and no `id_decoded`, so that id is
  // both the plain form and the form to send back.
  it('falls back to the id when no plain spelling is reported', () => {
    const { id_decoded: _dropped, ...older } = model({ id: PLAIN_ID });

    expect(plainModelId(older)).toBe(PLAIN_ID);
  });

  it('falls back past an empty plain spelling', () => {
    expect(plainModelId(model({ id: PLAIN_ID, id_decoded: '' }))).toBe(
      PLAIN_ID,
    );
  });

  it('reads nothing but the two id fields', () => {
    expect(plainModelId({ id: 'a', id_decoded: 'b' })).toBe('b');
    expect(plainModelId({ id: 'a' })).toBe('a');
  });
});
