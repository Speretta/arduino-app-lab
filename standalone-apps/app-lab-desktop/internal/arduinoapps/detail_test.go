package arduinoapps

import (
	"context"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"testing"
)

// The read-only verdict is the whole guard: a wrong "writable" overwrites a shipped example the user cannot restore
// from App Lab, so the app id has to catch an orchestrator that omits the flag — including one we cannot decode.
func TestReadOnlyVerdict(t *testing.T) {
	yes, no := true, false
	id := func(decoded string) string { return base64.RawStdEncoding.EncodeToString([]byte(decoded)) }

	for name, tc := range map[string]struct {
		appID   string
		example *bool
		want    bool
	}{
		"the flag alone marks a built-in":            {id("examples:inspirational/blink"), &yes, true},
		"a user app stays writable":                  {id("user:my-app"), &no, false},
		"an absent flag falls back to the id":        {id("examples:bricks/arduino/x/01_led"), nil, true},
		"an absent flag on a user app is writable":   {id("user:my-app"), nil, false},
		"an unreadable id with no flag fails closed": {"not!base64", nil, true},
		"an unreadable id still trusts a false flag": {"not!base64", &no, false},
		"the id overrides a false flag":              {id("examples:core-and-foundational/01"), &no, true},
	} {
		if got := readOnly(tc.appID, tc.example); got != tc.want {
			t.Errorf("%s: readOnly = %v, want %v", name, got, tc.want)
		}
	}
}

// A release has a user-looking id and example=false, so only its flag and its path keep the mirror from writing it.
func TestResolveAppMarksReleasesReadOnly(t *testing.T) {
	userID := base64.RawURLEncoding.EncodeToString([]byte("user:my-app"))
	for name, tc := range map[string]struct {
		body string
		want bool
	}{
		"a user app":                  {`{"path":"/home/arduino/ArduinoApps/my-app","example":false}`, false},
		"a release":                   {`{"path":"/var/lib/arduino-app-cli/releases/r1","example":false,"release":true}`, true},
		"a path outside the apps dir": {`{"path":"/var/lib/arduino-app-cli/releases/r1","example":false}`, true},
	} {
		board := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/v1/config" {
				_, _ = w.Write([]byte(`{"directories":{"apps":"/home/arduino/ArduinoApps"}}`))
				return
			}
			_, _ = w.Write([]byte(tc.body))
		}))
		target, err := ResolveApp(context.Background(), board.URL, userID)
		board.Close()
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if target.ReadOnly != tc.want {
			t.Errorf("%s: ReadOnly = %v, want %v", name, target.ReadOnly, tc.want)
		}
	}
}
