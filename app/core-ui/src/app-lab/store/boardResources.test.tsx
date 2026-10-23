import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  applyResourcesMessage,
  useBoardResourcesStore,
} from './boardResources';

describe('applyResourcesMessage', () => {
  it('stores cpu, memory and both disks', () => {
    let resources = applyResourcesMessage(
      undefined,
      'cpu',
      { used_percent: 42 },
      false,
    );
    resources = applyResourcesMessage(
      resources,
      'mem',
      { used: 1, total: 8 },
      false,
    );
    resources = applyResourcesMessage(
      resources,
      'disk',
      { used: 2, total: 20, path: '/home/arduino' },
      false,
    );
    resources = applyResourcesMessage(
      resources,
      'disk',
      { used: 3, total: 30, path: '/' },
      false,
    );

    expect(resources).toEqual({
      cpuPercentage: 42,
      ram: { used: 1, total: 8 },
      homeDisk: { used: 2, total: 20 },
      rootDisk: { used: 3, total: 30 },
    });
  });

  it('stores npu only on a VentunoQ', () => {
    const prev = { cpuPercentage: 1 };
    expect(applyResourcesMessage(prev, 'npu', { max_percent: 7 }, false)).toBe(
      prev,
    );
    expect(
      applyResourcesMessage(prev, 'npu', { max_percent: 7 }, true),
    ).toEqual({ cpuPercentage: 1, npuPercentage: 7 });
  });

  it('ignores a memory or disk sample missing used or total', () => {
    const prev = { cpuPercentage: 1 };
    expect(applyResourcesMessage(prev, 'mem', { used: 1 }, false)).toBe(prev);
    expect(applyResourcesMessage(prev, 'mem', { total: 8 }, false)).toBe(prev);
    expect(
      applyResourcesMessage(
        prev,
        'disk',
        { used: 1, path: '/home/arduino' },
        false,
      ),
    ).toBe(prev);
  });

  it('returns the previous object for disks it does not show and unknown types', () => {
    const prev = { cpuPercentage: 1 };
    expect(
      applyResourcesMessage(
        prev,
        'disk',
        { used: 1, total: 2, path: '/boot' },
        false,
      ),
    ).toBe(prev);
    expect(applyResourcesMessage(prev, 'error', {}, false)).toBe(prev);
  });
});

describe('useBoardResourcesStore', () => {
  beforeEach(() => {
    useBoardResourcesStore.getState().reset();
  });

  it('re-renders a subscriber only when its selected value changes', () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useBoardResourcesStore((state) => state.resources?.ram?.total);
    });

    act(() => {
      useBoardResourcesStore
        .getState()
        .applyMessage('mem', { used: 1, total: 8 }, false);
    });
    expect(result.current).toBe(8);
    const rendersAfterMemory = renders;

    act(() => {
      useBoardResourcesStore
        .getState()
        .applyMessage('cpu', { used_percent: 50 }, false);
      useBoardResourcesStore
        .getState()
        .applyMessage('mem', { used: 2, total: 8 }, false);
    });
    expect(renders).toBe(rendersAfterMemory);
    expect(useBoardResourcesStore.getState().resources?.cpuPercentage).toBe(50);
  });

  it('reset clears the resources', () => {
    useBoardResourcesStore
      .getState()
      .applyMessage('cpu', { used_percent: 50 }, false);
    useBoardResourcesStore.getState().reset();
    expect(useBoardResourcesStore.getState().resources).toBeUndefined();
  });
});
