import {
  Board,
  ConnectionType,
  HwDeviceType,
  HwKind,
  HwList,
  HwStatus,
} from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';

import { board, carrier, hw } from '../../wailsjs/go/models';

function mapProtocol(protocol: string): ConnectionType {
  switch (protocol) {
    case 'serial':
      return 'USB';
    case 'network':
      return 'Network';
    case 'local':
      return 'Local';
    default:
      throw new Error('Unknown protocol');
  }
}

function mapBoard(board: board.Board): Board {
  return {
    id: board.id,
    type: board.info.BoardName,
    name: board.info.CustomName,
    fqbn: board.info.FQBN,
    connectionType: mapProtocol(board.info.Protocol),
    protocol: board.info.Protocol,
    serial: board.info.Serial,
    address: board.info.Address,
  };
}

export function mapGetBoards(boards: board.Board[]): Board[] {
  return boards.map(mapBoard);
}

export function mapCarriers(carriers: carrier.CarrierResponse): HwList {
  return {
    mounts: carriers.carriers.map((carrier) => ({
      name: carrier.name,
      kind: 'carrier',
      devices: carrier.devices.map((device) => ({
        name: device.name,
        deviceType: device.device_type as HwDeviceType,
        options: device.available_devices,
        osSupport: true,
      })),
      osSupport: true,
    })),
  };
}

export function mapCarriersStatus(
  carriersStatus: carrier.ShowResult,
): HwStatus {
  return {
    mounts: carriersStatus.carriers.map((carrier) => ({
      name: carrier.carrier_name,
      kind: 'carrier',
      currentDevices: carrier.current.map((device) => ({
        device: device.device,
        option: device.option,
        deviceType: device.device_type as HwDeviceType,
      })),
      currentEnabled: carrier.current_enabled,
      nextDevices: carrier.next.map((device) => ({
        device: device.device,
        option: device.option,
        deviceType: device.device_type as HwDeviceType,
      })),
      nextEnabled: carrier.next_enabled,
    })),
  };
}

export function mapHwList(result: hw.ListResult): HwList {
  return {
    mounts: result.mounts.map((mount) => ({
      name: mount.name,
      kind: mount.kind as HwKind,
      devices: mount.devices.map((device) => ({
        name: device.name,
        deviceType: device.device_type as HwDeviceType,
        options: device.options,
        osSupport: device.os_support,
      })),
      osSupport: mount.os_support,
    })),
  };
}

export function mapHwShow(result: hw.ShowResult): HwStatus {
  return {
    mounts: result.mounts.map((mount) => ({
      currentDevices: mount.current.map((device) => ({
        device: device.device,
        deviceType: device.device_type as HwDeviceType,
        option: device.option,
      })),
      currentEnabled: mount.current_enabled,
      kind: mount.kind as HwKind,
      name: mount.name,
      nextDevices: mount.next.map((device) => ({
        device: device.device,
        deviceType: device.device_type as HwDeviceType,
        option: device.option,
      })),
      nextEnabled: mount.next_enabled,
    })),
  };
}
