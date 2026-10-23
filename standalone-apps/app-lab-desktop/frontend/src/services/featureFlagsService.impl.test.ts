import { FEATURE_FLAGS } from '@cloud-editor-mono/domain/src/services/feature-flags-service';
import { describe, expect, it } from 'vitest';

import goFeatureFlagsSource from '../../../internal/featureflags/featureflags.go?raw';

const readGoFeatureFlags = (): string[] => {
  const block = goFeatureFlagsSource.match(
    /var feature_flags = \[\]string\{([^}]*)\}/,
  );
  if (!block) {
    throw new Error('feature_flags not found in featureflags.go');
  }
  return [...block[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
};

describe('FEATURE_FLAGS', () => {
  it('matches the feature_flags allowlist in the Go backend', () => {
    expect([...FEATURE_FLAGS].sort()).toEqual(readGoFeatureFlags().sort());
  });
});
