// Must match feature_flags in
// standalone-apps/app-lab-desktop/internal/featureflags/featureflags.go;
// standalone-apps/app-lab-desktop/frontend/src/services/featureFlagsService.impl.test.ts
// fails when the two lists differ.
export const FEATURE_FLAGS = [
  'SHOW_VERSION_IN_FOOTER',
  'UPDATE_IN_DEV_MODE',
] as const;

export type FeatureFlag = typeof FEATURE_FLAGS[number];

export interface FeatureFlagService {
  getFeatureFlags: () => Promise<string[]>;
  getFeatureFlagsSync: () => FeatureFlag[];
  isFFEnabled: (ff: FeatureFlag) => boolean;
}
