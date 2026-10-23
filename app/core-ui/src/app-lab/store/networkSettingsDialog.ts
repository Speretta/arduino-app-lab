import { createOpenDialogStore } from './openDialogStore';

// Open-state for the single app-wide network settings dialog, rendered by
// main. Triggered from the offline warning, the settings screen's "change
// network" row and the cloud connector connect flow.
export const useNetworkSettingsDialogStore = createOpenDialogStore();
