import { SystemResourcesStreamMessageType } from '@cloud-editor-mono/infrastructure';
import { BoardResources } from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { create } from 'zustand';

export const bytesToGiB = (bytes: unknown): string =>
  ((bytes as number) / 1024 / 1024 / 1024).toFixed(2);

export const getUsedPercent = (used: unknown, total: unknown): number =>
  ((used as number) / (total as number)) * 100;

type ResourcesMessageData = {
  used_percent?: number;
  max_percent?: number;
  used?: number;
  total?: number;
  path?: string;
};

// A sample missing either field cannot be shown: `bytesToGiB` would render it
// as "NaN GB".
const toUsage = (
  data: ResourcesMessageData,
): { used: number; total: number } | undefined =>
  data.used === undefined || data.total === undefined
    ? undefined
    : { used: data.used, total: data.total };

// Returns `prev` unchanged for messages that carry nothing the UI shows, so
// subscribers do not re-render for them.
export const applyResourcesMessage = (
  prev: BoardResources | undefined,
  messageType: string,
  data: ResourcesMessageData,
  isVentunoQ: boolean,
): BoardResources | undefined => {
  if (messageType === SystemResourcesStreamMessageType.Cpu) {
    return { ...prev, cpuPercentage: data.used_percent };
  }
  if (messageType === SystemResourcesStreamMessageType.Npu && isVentunoQ) {
    return { ...prev, npuPercentage: data.max_percent };
  }
  if (messageType === SystemResourcesStreamMessageType.Memory) {
    const ram = toUsage(data);
    return ram ? { ...prev, ram } : prev;
  }
  if (messageType === SystemResourcesStreamMessageType.Disk) {
    const disk = toUsage(data);
    if (!disk) {
      return prev;
    }
    if (data.path === '/home/arduino') {
      return { ...prev, homeDisk: disk };
    }
    if (data.path === '/') {
      return { ...prev, rootDisk: disk };
    }
  }
  return prev;
};

type BoardResourcesStore = {
  resources: BoardResources | undefined;
  applyMessage: (
    messageType: string,
    data: ResourcesMessageData,
    isVentunoQ: boolean,
  ) => void;
  reset: () => void;
};

export const useBoardResourcesStore = create<BoardResourcesStore>((set) => ({
  resources: undefined,
  applyMessage: (messageType, data, isVentunoQ): void =>
    set((state) => {
      const resources = applyResourcesMessage(
        state.resources,
        messageType,
        data,
        isVentunoQ,
      );
      return resources === state.resources ? state : { resources };
    }),
  reset: (): void => set({ resources: undefined }),
}));
