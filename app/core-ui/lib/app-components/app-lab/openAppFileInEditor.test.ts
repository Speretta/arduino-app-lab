import { beforeEach, describe, expect, it, vi } from 'vitest';

import { openAppFileInEditor } from '../../../src/app-lab/openAppFileInEditor';

const { navigate, getAppDetail } = vi.hoisted(() => ({
  navigate: vi.fn(),
  getAppDetail: vi.fn(),
}));

// The real router drags in the whole route tree, and with it a Worker jsdom has not got.
vi.mock('../../../src/app-lab/router', () => ({ default: { navigate } }));

vi.mock(
  '@cloud-editor-mono/domain/src/services/services-by-app/app-lab',
  () => ({
    getAppDetail,
    decodeBase64ToString: (b: string): string =>
      Buffer.from(b, 'base64').toString('utf8'),
  }),
);

const id = (decoded: string): string =>
  Buffer.from(decoded).toString('base64').replace(/=+$/, '');

const routeFor = async (
  appId: string,
  detail: unknown,
): Promise<string | undefined> => {
  getAppDetail.mockReset();
  navigate.mockReset();
  if (detail instanceof Error) {
    getAppDetail.mockRejectedValue(detail);
  } else {
    getAppDetail.mockResolvedValue(detail);
  }
  await openAppFileInEditor(appId, 'python/main.py');
  expect(navigate).toHaveBeenCalledWith(
    expect.objectContaining({ params: { appId } }),
  );
  return navigate.mock.calls[0]?.[0]?.to;
};

// The section decides whether the editor is writable, and it autosaves: a wrong
// verdict here edits a shipped example on the board.
describe('openAppFileInEditor', () => {
  beforeEach(() => {
    navigate.mockReset();
    getAppDetail.mockReset();
  });

  it("follows the board's example flag", async () => {
    expect(
      await routeFor(id('examples:color-your-leds'), { example: true }),
    ).toBe('/examples/$appId');
  });

  // The flag is the half the id cannot cover: an example whose id says otherwise.
  it('trusts the flag over an id that says nothing', async () => {
    expect(await routeFor(id('user:legacy-example'), { example: true })).toBe(
      '/examples/$appId',
    );
  });

  it('keeps a user app on the writable route', async () => {
    expect(await routeFor(id('user:blink-black'), { example: false })).toBe(
      '/my-apps/$appId',
    );
  });

  it('falls back to the id when the flag is absent', async () => {
    expect(await routeFor(id('examples:bricks/arduino/x/01_led'), {})).toBe(
      '/examples/$appId',
    );
  });

  it('lets the id override a false flag', async () => {
    expect(
      await routeFor(id('examples:core-and-foundational/01'), {
        example: false,
      }),
    ).toBe('/examples/$appId');
  });

  it('fails closed when the board cannot answer', async () => {
    expect(
      await routeFor(id('user:blink-black'), new Error('no board connected')),
    ).toBe('/examples/$appId');
  });
});
