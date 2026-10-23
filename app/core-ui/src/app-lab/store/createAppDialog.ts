import { createOpenDialogStore } from './openDialogStore';

// Open-state for the single app-wide create-app dialog, owned by main and
// triggered from both the side panel's "+" and the app list's create button
export const useCreateAppDialogStore = createOpenDialogStore();
