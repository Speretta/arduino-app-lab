import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  connectToWiFi,
  getNetworkList,
  getNetworkStatus,
  setSettingsService,
} from './settingsService.impl';
import {
  mockGetNetworkList,
  MockSettingsService,
} from './settingsService.mock';

beforeAll(() => {
  setSettingsService(MockSettingsService);
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('settingsService.impl + MockSettingsService – getNetworkList', () => {
  it('getNetworkList returns mocked wifi network list', async () => {
    const list = await getNetworkList();
    const expected = mockGetNetworkList();

    expect(list).toEqual(expected);
    expect(list).toEqual(['Mock WiFi 1', 'Mock WiFi 2', 'Timeout WiFi']);
  });
});

describe('settingsService.impl + MockSettingsService – initial states', () => {
  it('correctly exposes wifi/ethernet/internet states (regardless of current state)', async () => {
    const { wifi, ethernet: eth, internet } = await getNetworkStatus();

    expect(['connected', 'disconnected', 'connecting']).toContain(wifi);
    expect(['connected', 'disconnected', 'connecting']).toContain(eth);
    expect(typeof internet).toBe('boolean');
  });
});

describe('settingsService.impl + MockSettingsService – connectToWiFi success', () => {
  it('with normal SSID sets wifi=connected, ethernet=disconnected, internet=true', async () => {
    vi.useFakeTimers();

    const ssid = 'Mock WiFi 1';
    const password = 'super-secret';

    const promise = connectToWiFi(ssid, password);

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeUndefined();

    const { wifi, ethernet: eth, internet } = await getNetworkStatus();

    expect(wifi).toBe('connected');
    expect(eth).toBe('disconnected');
    expect(internet).toBe(true);

    vi.useRealTimers();
  });
});

describe('settingsService.impl + MockSettingsService – connectToWiFi timeout', () => {
  it('with SSID "Timeout WiFi" returns "timeout" and leaves wifi in connecting state and internet=false', async () => {
    const ssid = 'Timeout WiFi';
    const password = 'pwd';

    const result = await connectToWiFi(ssid, password);

    expect(result).toBe('timeout');

    const { wifi, ethernet: eth, internet } = await getNetworkStatus();

    expect(wifi).toBe('connecting');
    expect(eth).toBe('disconnected');
    expect(internet).toBe(false);
  });
});
