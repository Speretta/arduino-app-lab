package featureflags

import "os"

// Must match FEATURE_FLAGS in
// app/domain/src/services/feature-flags-service/featureFlagsService.type.ts;
// featureFlagsService.test.ts fails when the two lists differ.
var feature_flags = []string{
	"SHOW_VERSION_IN_FOOTER",
	"UPDATE_IN_DEV_MODE",
}

func enabled(ff string) bool {
	return os.Getenv(ff) == "true"
}

func GetFeatureFlags() []string {
	flags := make([]string, 0)
	for _, s := range feature_flags {
		if !enabled(s) {
			continue
		}
		flags = append(flags, s)
	}

	return flags
}
