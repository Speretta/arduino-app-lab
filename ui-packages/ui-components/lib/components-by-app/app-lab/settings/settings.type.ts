import { CloudConnectorStatus } from '@cloud-editor-mono/infrastructure';
import {
  Board,
  BoardExtensionsAttachDialogLogic,
  BoardResources,
  ChangePasswordDialogLogic,
  CloudConnectorConnectDialogLogic,
  CloudConnectorDisconnectDialogLogic,
  KeyboardLayout,
  NetworkItem,
  PasswordDialogLogic,
} from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';

export type UseCloudConnectorSettingsLogic = () => {
  status?: CloudConnectorStatus;
  connectBoard: () => void;
  disconnectBoard: () => void;
  connectDialogLogic: CloudConnectorConnectDialogLogic;
  disconnectDialogLogic: CloudConnectorDisconnectDialogLogic;
  isConnecting: boolean;
  isDisconnecting: boolean;
};

export type UseBoardSettingsLogic = () => {
  isBoard: boolean;
  board?: Board;
  boardName?: string;
  boardResources?: BoardResources;
  keyboardLayout: KeyboardLayout | undefined;
  keyboardLayouts: KeyboardLayout[];
  bytesToGiB: (bytes: unknown) => string;
  setBoardName: (name: string) => void;
  setKeyboardLayout: (layout: string) => void;
  setBoardNameIsError: boolean;
  boardNameErrorMsg: string;
};

export type HwKind = 'carrier' | 'hat';
export type HwDeviceType = 'camera' | 'display';

export type HwList = {
  mounts: HwListMount[];
};

export type HwListMount = {
  name: string;
  kind: HwKind;
  devices: HwListDevice[];
  osSupport: boolean;
};

export type HwListDevice = {
  name: string;
  deviceType: HwDeviceType;
  options: string[];
  osSupport: boolean;
};

export enum HwErrorCode {
  IncorrectPassword = 'ERR_HW_INCORRECT_PASSWORD',
  CommandFailed = 'ERR_HW_COMMAND_FAILED',
}

export class HwError extends Error {
  constructor(readonly code: HwErrorCode, message: string) {
    super(message);
    this.name = 'HwError';
  }
}

export type HwStatus = {
  mounts: HwStatusMount[];
};

export type HwStatusMount = {
  name: string;
  kind: HwKind;
  currentEnabled: boolean;
  nextEnabled: boolean;
  currentDevices: HwStatusDevice[];
  nextDevices: HwStatusDevice[];
};

export type HwStatusDevice = {
  device: string;
  option: string;
  deviceType: HwDeviceType;
};

export type UseBoardExtensionsSettingsLogic = () => {
  attachLogic: BoardExtensionsAttachDialogLogic;
  openAttachCarrierDialog: () => void;
  openAttachHatDialog: () => void;
  status: HwStatus;
  carrierEnabled: boolean;
  carrierPristine: boolean;
  onCarrierEnabledChange: (carrierEnabled: boolean) => void;
  carriers: HwListMount[];
  setCarrierStatus: (
    carrierName: string,
    device: string,
    option: string,
  ) => void;
  supported: boolean;
  hatEnabled: boolean;
  hatPristine: boolean;
  onHatEnabledChange: (hatEnabled: boolean) => void;
  hats: HwListMount[];
  setHatStatus: (device: string) => void;
  passwordLogic: PasswordDialogLogic;
  // The dialog owns its own fields now, so the screen gets an opener rather than
  // reaching into the contract to flip `open`.
  openPasswordDialog: () => void;
};

export type UseNetworkModeLogic = () => {
  isNetworkModeEnabled?: boolean;
  passwordLogic: PasswordDialogLogic;
  openPasswordDialog: () => void;
};

export type UseNetworkSettingsLogic = () => {
  isConnected?: boolean;
  selectedConnectedNetwork?: NetworkItem | null;
  selectedConnectedIPAddress?: string | null;
  openNetworkSettingsDialog: () => void;
};

export type UseSystemSettingsLogic = () => {
  currentAppVersion?: string;
  hasBoardUpdate: boolean;
  needsImageUpdate?: boolean;
  newAppVersion?: string;
  osImageVersion?: string;
  osReleaseDate?: string;
  kernelVersion?: string;
  linuxDistribution?: string;
  openFlasher: () => void;
  startUpdate: () => void;
};

export type UsePasswordSettingsLogic = () => {
  changePasswordLogic: ChangePasswordDialogLogic;
  openChangePasswordDialog: () => void;
};

export type UseSettingsLogic = () => {
  cloudConnectorSettingsLogic: UseCloudConnectorSettingsLogic;
  boardSettingsLogic: UseBoardSettingsLogic;
  boardExtensionsSettingsLogic: UseBoardExtensionsSettingsLogic;
  networkModeLogic: UseNetworkModeLogic;
  networkSettingsLogic: UseNetworkSettingsLogic;
  systemSettingsLogic: UseSystemSettingsLogic;
  passwordSettingsLogic: UsePasswordSettingsLogic;
  onOpenExternal: (url: string) => void;
};

export interface SettingsProps {
  settingsLogic: UseSettingsLogic;
  // Optional extra section rendered at the very end, just before the copyright
  // line (with a divider above). Kept as a slot so ui-components doesn't depend
  // on the feature package that provides it (e.g. the AI assistant's Agent panel).
  agentSection?: React.ReactNode;
}
