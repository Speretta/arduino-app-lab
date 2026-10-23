import { ArduinoBuilderBoardv3Full_BuilderApi } from '@cloud-editor-mono/infrastructure';
import {
  IotDevicesGroups,
  IotPortName,
} from '@cloud-editor-mono/ui-components';

import {
  test_AddMappedPort,
  test_RemoveMappedPort,
} from '../../../../../tests-setup';
import { createIotPortBoardID } from '../../../../common/hooks/queries/iot';
import { createPortBoardID } from '../../../../common/providers/serial-communication/utils';

// Auto selection external side effects
export let promptedSelection = false;
export function resetPromptedSelection(): void {
  promptedSelection = false;
}
export function mockPromptBoardConfigSelection(): void {
  promptedSelection = true;
}

// sketch props
export const sketchId = 'sketchId';

// ** ** Iot Devices Groups
export const iotDevicesGroupsEmpty: IotDevicesGroups = {
  online: [],
  offline: [],
};

export const mockIotUnoOnline = {
  id: 'mock-device-two-iot',
  isIot: true,
  originalName: 'Arduino Uno',
  name: 'Dave - Arduino Uno',
  portName: IotPortName.Online,
  fqbn: 'arduino:avr:uno',
  portBoardId: createIotPortBoardID(IotPortName.Online, 'mock-device-two-iot'),
  serialNumber: '954323132383515092E1',
  architecture: 'avr',
  isUnknownBoard: false,
  isAssociated: false,
  otaCompatible: true,
};

const mockIotMkrWifi1010Offline = {
  id: 'mock-device-one-iot',
  originalName: 'Arduino MKR WiFi 1010',
  name: 'Dave - Arduino MKR WiFi 1010',
  portName: IotPortName.Offline,
  fqbn: 'arduino:samd:mkrwifi1010',
  portBoardId: createIotPortBoardID(IotPortName.Offline, 'mock-device-one-iot'),
  serialNumber: '0E6CDB4750583153382E3120FF012B09',
  architecture: 'samd',
  isUnknownBoard: false,
  isAssociated: false,
};

export const mockIotESP32Online = {
  id: 'mock-device-three-iot',
  isIot: true,
  originalName: 'DOIT ESP32 DEVKIT V1',
  name: 'Dave - DOIT ESP32 DEVKIT V1',
  portName: IotPortName.Online,
  fqbn: 'esp32:esp32:esp32doit-devkit-v1',
  portBoardId: createIotPortBoardID(
    IotPortName.Online,
    'mock-device-three-iot',
  ),
  serialNumber: '0E6CDB47505831509093382E3120FF012B09',
  architecture: 'esp32',
  isUnknownBoard: false,
  isAssociated: false,
};

// A stable-serial board (MKR WiFi 1010) whose IoT metadata has NO serial number
// (e.g. board migrated via BLE, so iot-api can't return a serial). Used to verify
// the FQBN fallback still matches its USB port and enables upload.
export const mockIotMkr1010OnlineNoSerial = {
  id: 'mock-device-mkr-iot',
  isIot: true,
  originalName: 'Arduino MKR WiFi 1010',
  name: 'Dave - Arduino MKR WiFi 1010',
  portName: IotPortName.Online,
  fqbn: 'arduino:samd:mkrwifi1010',
  portBoardId: createIotPortBoardID(IotPortName.Online, 'mock-device-mkr-iot'),
  serialNumber: '',
  architecture: 'samd',
  isUnknownBoard: false,
  isAssociated: false,
  otaCompatible: true,
};

export const iotDevicesGroupsWithOneOnline: IotDevicesGroups = {
  online: [mockIotUnoOnline],
  offline: [],
};
export const iotDevicesGroupsWithESP32Online: IotDevicesGroups = {
  online: [mockIotESP32Online],
  offline: [],
};
export const iotDevicesGroupsWithMkr1010OnlineNoSerial: IotDevicesGroups = {
  online: [mockIotMkr1010OnlineNoSerial],
  offline: [],
};
export const iotDevicesGroupsWithOneOffline: IotDevicesGroups = {
  online: [],
  offline: [mockIotMkrWifi1010Offline],
};
export const iotDevicesGroupsWithOneOnlineOneOffline: IotDevicesGroups = {
  online: [mockIotUnoOnline],
  offline: [mockIotMkrWifi1010Offline],
};

export const mockMkrWifi1010 = {
  id: 'mock-device-one',
  name: 'Arduino MKR WiFi 1010',
  portName: '/dev/cu.usbmodem21401',
  fqbn: 'arduino:samd:mkrwifi1010',
  portBoardId: createPortBoardID('/dev/cu.usbmodem21401', '0x8054', '0x2341'),
  isOpen: true,
  serialNumber: '0E6CDB4750583153382E3120FF012B09',
  productId: '0x8054',
  vendorId: '0x2341',
  architecture: 'samd',
  isUnknownBoard: false,
};
export function addMkr1010MappedPort(): void {
  test_AddMappedPort(mockMkrWifi1010);
}
export function removeMkr1010MappedPort(): void {
  test_RemoveMappedPort(mockMkrWifi1010.id);
}

export const mockUno = {
  id: 'mock-device-two',
  name: 'Arduino Uno',
  portName: '/dev/cu.usbmodem21201',
  fqbn: 'arduino:avr:uno',
  portBoardId: createPortBoardID('/dev/cu.usbmodem21201', '0x2341', '0x0043'),
  isOpen: true,
  serialNumber: '954323132383515092E1',
  productId: '0x2341',
  vendorId: '0x0043',
  architecture: 'avr',
  isUnknownBoard: false,
};
export function addUnoMappedPort(): void {
  test_AddMappedPort(mockUno);
}
export function removeUnoMappedPort(): void {
  test_RemoveMappedPort(mockUno.id);
}

export const mockUnoTwo = {
  ...mockUno,
  id: 'mock-device-two-b',
  portName: '/dev/cu.usbmodem212043',
  portBoardId: createPortBoardID('/dev/cu.usbmodem212043', '0x2341', '0x0043'),
  serialNumber: '9523123132383515092E1',
};
export function addUnoTwoMappedPort(): void {
  test_AddMappedPort(mockUnoTwo);
}
export function removeUnoTwoMappedPort(): void {
  test_RemoveMappedPort(mockUnoTwo.id);
}

export const mockESP32 = {
  id: 'mock-device-three',
  name: 'DOIT ESP32 DEVKIT V1',
  portName: '/dev/cu.usbmodem31401',
  fqbn: 'esp32:esp32:esp32doit-devkit-v1',
  portBoardId: createPortBoardID('/dev/cu.usbmodem31401', '0000', '0000'),
  isOpen: true,
  serialNumber: '0E6CDB47505831509093382E3120FF012B09',
  productId: '0000',
  vendorId: '0000',
  architecture: 'esp32',
  isUnknownBoard: false,
};
export function addESP32MappedPort(): void {
  test_AddMappedPort(mockESP32);
}
export function removeESP32MappedPort(): void {
  test_RemoveMappedPort(mockESP32.id);
}

// An ESP32 IoT device with no serial number in iot-api, and its USB port as
// production sees it: the boards API does not know ESP32 USB chips, so the port
// is an unknown board with no fqbn.
const mockIotESP32NoSerial = {
  id: 'mock-device-esp32-no-serial-iot',
  isIot: true,
  originalName: 'ESP32 Dev Module',
  name: 'Dave - ESP32 Dev Module',
  fqbn: 'esp32:esp32:esp32',
  serialNumber: '',
  architecture: 'esp32',
  isUnknownBoard: false,
  isAssociated: false,
  otaCompatible: true,
};
export const mockIotESP32OnlineNoSerial = {
  ...mockIotESP32NoSerial,
  portName: IotPortName.Online,
  portBoardId: createIotPortBoardID(
    IotPortName.Online,
    mockIotESP32NoSerial.id,
  ),
};
export const mockIotESP32OfflineNoSerial = {
  ...mockIotESP32NoSerial,
  portName: IotPortName.Offline,
  portBoardId: createIotPortBoardID(
    IotPortName.Offline,
    mockIotESP32NoSerial.id,
  ),
};
export const iotDevicesGroupsWithESP32OnlineNoSerial: IotDevicesGroups = {
  online: [mockIotESP32OnlineNoSerial],
  offline: [],
};
export const iotDevicesGroupsWithESP32OfflineNoSerial: IotDevicesGroups = {
  online: [],
  offline: [mockIotESP32OfflineNoSerial],
};
export const iotDevicesGroupsWithMkr1010OfflineNoSerial: IotDevicesGroups = {
  online: [],
  offline: [
    {
      ...mockIotMkr1010OnlineNoSerial,
      portName: IotPortName.Offline,
      portBoardId: createIotPortBoardID(
        IotPortName.Offline,
        mockIotMkr1010OnlineNoSerial.id,
      ),
    },
  ],
};

export const mockUnknownESP32Port = {
  id: 'mock-device-unknown-esp32',
  name: 'Unknown',
  portName: '/dev/cu.usbserial-0001',
  portBoardId: createPortBoardID('/dev/cu.usbserial-0001', '0xea60', '0x10c4'),
  isOpen: true,
  serialNumber: '0001',
  productId: '0xea60',
  vendorId: '0x10c4',
  isUnknownBoard: true,
};
export function addUnknownESP32MappedPort(): void {
  test_AddMappedPort(mockUnknownESP32Port);
}

export const fqbnQueryData: {
  [key: string]: ArduinoBuilderBoardv3Full_BuilderApi;
} = {
  'arduino:samd:mkrwifi1010': {
    architecture: 'samd',
    fqbn: 'arduino:samd:mkrwifi1010',
    name: 'Arduino MKR WiFi 1010',
    board_id: 'mkrwifi1010',
    vendor: 'arduino',
  },
  'arduino:avr:uno': {
    architecture: 'avr',
    fqbn: 'arduino:avr:uno',
    name: 'Arduino Uno',
    board_id: 'uno',
    vendor: 'arduino',
  },
  'esp32:esp32:esp32doit-devkit-v1': {
    architecture: 'esp32',
    fqbn: 'esp32:esp32:esp32doit-devkit-v1',
    name: 'DOIT ESP32 DEVKIT V1',
    board_id: 'esp32doit-devkit-v1',
    vendor: 'espressif',
  },
};
