import { NetworkItem } from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';

export type WiFiConnectionStatus = 'connected' | 'disconnected' | 'connecting';
export type EthernetConnectionStatus =
  | 'connected'
  | 'disconnected'
  | 'connecting';
export interface NetworkStatus {
  wifi: WiFiConnectionStatus;
  ethernet: EthernetConnectionStatus;
  internet: boolean;
}

export interface SettingsService {
  getNetworkList(): Promise<NetworkItem[]>;
  // One call, because the board answers all three over one SSH session and its
  // sshd allows 10.
  getNetworkStatus(): Promise<NetworkStatus>;
  connectToWiFi(ssid: string, password: string): Promise<void | 'timeout'>;
  disconnectWiFi(): Promise<void>;
  getConnectionName(): Promise<string | null>;
  getIPAddress(): Promise<string | null>;
}
