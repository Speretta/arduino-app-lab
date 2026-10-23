import type { HwStatusMount } from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { app } = vi.hoisted(() => ({
  app: {
    HwAvailable: vi.fn(async () => true),
    HwEnable: vi.fn(async () => undefined),
    HwDisable: vi.fn(async () => undefined),
  },
}));

vi.mock('../../wailsjs/go/app/App', () => app);
// The real modules pull in the whole component library, which does not load in
// the test environment.
vi.mock(
  '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab',
  () => ({
    HwError: class extends Error {},
    HwErrorCode: {},
  }),
);
vi.mock('@cloud-editor-mono/core-ui/app-lab/persistent-store', () => ({
  get: vi.fn(),
  set: vi.fn(),
}));

import { setHwStatus } from './boardService.impl.standalone';

const carrier = (overrides: Partial<HwStatusMount>): HwStatusMount => ({
  name: 'mipi',
  kind: 'carrier',
  currentEnabled: false,
  nextEnabled: false,
  currentDevices: [{ device: 'camera0', option: 'none', deviceType: 'camera' }],
  nextDevices: [{ device: 'camera0', option: 'none', deviceType: 'camera' }],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('setHwStatus', () => {
  it('enables a carrier switched on with every option left on none', async () => {
    await setHwStatus({ mounts: [carrier({ nextEnabled: true })] }, 'pw');

    expect(app.HwEnable).toHaveBeenCalledWith('pw', 'mipi', [
      { Device: 'camera0', Option: 'none' },
    ]);
    expect(app.HwDisable).not.toHaveBeenCalled();
  });

  it('leaves an untouched disabled carrier alone', async () => {
    await setHwStatus({ mounts: [carrier({})] }, 'pw');

    expect(app.HwEnable).not.toHaveBeenCalled();
    expect(app.HwDisable).not.toHaveBeenCalled();
  });

  it('disables an enabled carrier switched off', async () => {
    await setHwStatus(
      { mounts: [carrier({ currentEnabled: true, nextEnabled: false })] },
      'pw',
    );

    expect(app.HwDisable).toHaveBeenCalledWith('pw', 'mipi');
    expect(app.HwEnable).not.toHaveBeenCalled();
  });
});
