package boardmcp

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// A release listed among the user's apps reads as editable to the agent.
func TestShapeAppsListSplitsReleases(t *testing.T) {
	raw := `{"apps":[
		{"id":"u1","name":"Mine","status":"stopped","example":false,"release":false},
		{"id":"r1","name":"Shipped","status":"stopped","example":false,"release":true},
		{"id":"e1","name":"Blink","status":"stopped","example":true}
	]}`
	shaped, err := shapeAppsList(raw)
	if err != nil {
		t.Fatal(err)
	}
	var out struct {
		Apps, Releases, Examples []appEntry
	}
	if err := json.Unmarshal([]byte(shaped), &out); err != nil {
		t.Fatal(err)
	}
	if len(out.Apps) != 1 || out.Apps[0].ID != "u1" {
		t.Errorf("apps = %+v, want only u1", out.Apps)
	}
	if len(out.Releases) != 1 || out.Releases[0].ID != "r1" {
		t.Errorf("releases = %+v, want only r1", out.Releases)
	}
	if len(out.Examples) != 1 || out.Examples[0].ID != "e1" {
		t.Errorf("examples = %+v, want only e1", out.Examples)
	}
}

func TestRequireUserApp(t *testing.T) {
	userAppID := base64.RawURLEncoding.EncodeToString([]byte("user:mine"))
	for name, tc := range map[string]struct {
		status  int
		body    string
		appsDir string
		wantOK  bool
	}{
		"a user app":              {http.StatusOK, `{"path":"/home/arduino/ArduinoApps/mine"}`, "", true},
		"a release":               {http.StatusOK, `{"path":"/var/lib/arduino-app-cli/releases/r1","release":true}`, "", false},
		"an example":              {http.StatusOK, `{"path":"/var/lib/arduino-app-cli/examples/blink","example":true}`, "", false},
		"a path outside, no flag": {http.StatusOK, `{"path":"/var/lib/arduino-app-cli/releases/r1"}`, "", false},
		"the apps dir itself":     {http.StatusOK, `{"path":"/home/arduino/ArduinoApps"}`, "", false},
		"a custom apps dir":       {http.StatusOK, `{"path":"/data/apps/mine"}`, "/data/apps", true},
		"an unreadable detail":    {http.StatusNotFound, `{"details":"not found"}`, "", false},
	} {
		t.Run(name, func(t *testing.T) {
			board := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/v1/config" {
					_, _ = w.Write([]byte(`{"directories":{"apps":"` + tc.appsDir + `"}}`))
					return
				}
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer board.Close()

			err := requireUserApp(context.Background(), stubAccess{base: board.URL}, userAppID)
			if tc.wantOK && err != nil {
				t.Errorf("refused a writable app: %v", err)
			}
			if !tc.wantOK && err == nil {
				t.Error("allowed a write to a read-only app")
			}
			if err != nil && tc.status == http.StatusOK && !strings.Contains(err.Error(), "apps_clone") {
				t.Errorf("refusal %q does not name the way forward", err)
			}
		})
	}
}
