/* eslint-disable no-empty */
import {
  EthernetConnectionStatus,
  SettingsService,
  WiFiConnectionStatus,
} from '@cloud-editor-mono/domain/src/services/services-by-app/app-lab';
import { WiFiConnectionErrorCode } from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';

import {
  ConnectToWiFi,
  DisconnectWiFi,
  GetConnectionName,
  GetIPAddress,
  GetNetworkStatus,
  ListSSIDs,
} from '../../wailsjs/go/app/App';

export const getNetworkList: SettingsService['getNetworkList'] =
  async function () {
    try {
      const response = await ListSSIDs();
      return response;
    } catch {}
    return [];
  };

export const getNetworkStatus: SettingsService['getNetworkStatus'] =
  async function () {
    try {
      const result = await GetNetworkStatus();
      return {
        wifi: result.wifi as WiFiConnectionStatus,
        ethernet: result.ethernet as EthernetConnectionStatus,
        internet: result.internet,
      };
    } catch (e) {
      console.error(`Failed to get network status: ${e}`);
      return {
        wifi: 'disconnected',
        ethernet: 'disconnected',
        internet: false,
      };
    }
  };

export const connectToWiFi: SettingsService['connectToWiFi'] = async function (
  ssid: string,
  password: string,
) {
  try {
    // Set a timeout for the WiFi connection attempt, as it can sometimes hang.
    const timeoutPromise = new Promise<'timeout'>((_, r) => {
      setTimeout(() => r('timeout'), 20000);
    });
    await Promise.race([ConnectToWiFi(ssid, password), timeoutPromise]);
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    if (raw === WiFiConnectionErrorCode.IncorrectPassword) {
      throw new Error(WiFiConnectionErrorCode.IncorrectPassword);
    }
    throw new Error(WiFiConnectionErrorCode.ConnectionFailed);
  }
};

export const disconnectWiFi: SettingsService['disconnectWiFi'] =
  async function () {
    try {
      const timeoutPromise = new Promise<'timeout'>((_, r) => {
        setTimeout(() => r('timeout'), 20000);
      });
      await Promise.race([DisconnectWiFi(), timeoutPromise]);
    } catch (e) {
      console.error(`Failed to disconnect from WiFi: ${e}`);
    }
  };

export const getConnectionName: SettingsService['getConnectionName'] =
  async function () {
    try {
      const result = await GetConnectionName();
      return result;
    } catch (e) {
      console.error(`Failed to get connection name: ${e}`);
      return null;
    }
  };

export const getIPAddress: SettingsService['getIPAddress'] = async function () {
  try {
    const result = await GetIPAddress();
    return result;
  } catch (e) {
    console.error(`Failed to get IP address: ${e}`);
    return null;
  }
};
