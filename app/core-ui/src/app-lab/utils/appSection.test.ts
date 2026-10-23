import { describe, expect, it } from 'vitest';

import { isExampleAppId } from './appSection';

// Ids arrive as the orchestrator emits them: unpadded base64.
const id = (decoded: string): string =>
  Buffer.from(decoded).toString('base64').replace(/=+$/, '');

// A wrong verdict makes a built-in example editable.
describe('isExampleAppId', () => {
  it('reads a user app as editable', () => {
    expect(isExampleAppId(id('user:my-app'))).toBe(false);
  });

  it('reads every kind of built-in as an example', () => {
    expect(isExampleAppId(id('examples:inspirational/blink'))).toBe(true);
    expect(isExampleAppId(id('examples:bricks/arduino/x/01_led'))).toBe(true);
    expect(isExampleAppId(id('examples:core-and-foundational/01'))).toBe(true);
  });

  // Nothing decodes an id before it gets here, but base64 has no ':' anyway.
  it('reads an id that arrives already decoded', () => {
    expect(isExampleAppId('examples:blink')).toBe(true);
    expect(isExampleAppId('user:my-app')).toBe(false);
  });
});
