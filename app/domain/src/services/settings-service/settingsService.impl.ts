import { SettingsService } from './settings-service.type';

export let getNetworkList: SettingsService['getNetworkList'] =
  async function () {
    throw new Error('getNetworkList service not implemented');
  };

export let getNetworkStatus: SettingsService['getNetworkStatus'] =
  async function () {
    throw new Error('getNetworkStatus service not implemented');
  };

export let connectToWiFi: SettingsService['connectToWiFi'] = async function (
  _ssid: string,
  _password: string,
) {
  throw new Error('connectToWiFi service not implemented');
};

export let disconnectWiFi: SettingsService['disconnectWiFi'] =
  async function () {
    throw new Error('disconnectWiFi service not implemented');
  };

export let getConnectionName: SettingsService['getConnectionName'] =
  async function () {
    throw new Error('getConnectionName service not implemented');
  };

export let getIPAddress: SettingsService['getIPAddress'] = async function () {
  throw new Error('getIPAddress service not implemented');
};

export const setSettingsService = (service: SettingsService): void => {
  getNetworkList = service.getNetworkList;
  getNetworkStatus = service.getNetworkStatus;
  connectToWiFi = service.connectToWiFi;
  disconnectWiFi = service.disconnectWiFi;
  getConnectionName = service.getConnectionName;
  getIPAddress = service.getIPAddress;
};
