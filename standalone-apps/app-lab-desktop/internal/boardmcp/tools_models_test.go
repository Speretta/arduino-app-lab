package boardmcp

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// The agent picks its tool from these fields: getting installable wrong sends it to models_install for a model that
// cannot be fetched by id, and losing source leaves every provider looking alike.
func TestShapeModelsList(t *testing.T) {
	raw := `{"models":[
		{"id":"m-hf","name":"Yolo","status":"available","metadata":{"source":"huggingface","publisher":"Ultralytics","runtime":"tflite","source-model-url":"https://x/y.zip"}},
		{"id":"m-hf-in","name":"Yolo","status":"installed","metadata":{"source":"huggingface","source-model-url":"https://x/y.zip"}},
		{"id":"m-nourl","name":"Orphan","status":"available","metadata":{"source":"qualcomm-ai-hub"}},
		{"id":"m-ei","name":"Mine","status":"not-installed","metadata":{"source":"edgeimpulse","source-model-url":"https://ei/z.zip","ei-project-id":"42","ei-impulse-id":"7","ei-impulse-name":"v3"}},
		{"id":"m-ei-nourl","name":"Linked","status":"not-installed","metadata":{"ei-project-id":"99"}},
		{"id":"m-builtin","name":"Stock","status":"installed","is_builtin":true,"size":1024}
	]}`

	out, err := shapeModelsList(raw)
	if err != nil {
		t.Fatal(err)
	}
	var got struct {
		Models []modelItem `json:"models"`
	}
	if err := json.Unmarshal([]byte(out), &got); err != nil {
		t.Fatal(err)
	}
	by := map[string]modelItem{}
	for _, m := range got.Models {
		by[m.ID] = m
	}

	if m := by["m-hf"]; !m.Installable || m.Installed || m.Source != "huggingface" || m.Publisher != "Ultralytics" || m.Runtime != "tflite" {
		t.Errorf("a downloadable third-party model: %+v", m)
	}
	if m := by["m-hf-in"]; m.Installable || !m.Installed {
		t.Errorf("an installed model must not be offered for install again: %+v", m)
	}
	if m := by["m-nourl"]; m.Installable || m.Source != "qualcomm-ai-hub" {
		t.Errorf("no download url means only the user can bring it in: %+v", m)
	}
	// A listed Edge Impulse model downloads by id with no account: sending the agent to the picker for it would be wrong.
	if m := by["m-ei"]; !m.Installable || m.Source != modelSourceEdgeImpulse || m.EdgeImpulse == nil || m.EdgeImpulse.ImpulseName != "v3" {
		t.Errorf("a listed Edge Impulse model: %+v", m)
	}
	// Absent source reads as Edge Impulse, the same default the UI applies.
	if m := by["m-ei-nourl"]; m.Installable || m.Source != modelSourceEdgeImpulse {
		t.Errorf("an Edge Impulse model with no download url: %+v", m)
	}
	// No metadata at all still defaults to Edge Impulse, and stays uninstallable with no download url.
	if m := by["m-builtin"]; !m.Builtin || !m.Installed || m.SizeBytes != 1024 || m.Source != modelSourceEdgeImpulse || m.Installable {
		t.Errorf("a built-in model: %+v", m)
	}
	if !strings.Contains(out, `"installable"`) {
		t.Error("installable must always be present, not omitted when false")
	}
}

// stubAccess answers only what the installer needs; any other call would panic on the nil embedded interface.
type stubAccess struct {
	BoardAccess
	base string
}

func (s stubAccess) OrchestratorBaseURL(context.Context) (string, error) { return s.base, nil }

// A retry must join the running download: a second request makes the board wipe the partial and stall the first.
func TestModelInstallerJoinsRunningDownload(t *testing.T) {
	var puts atomic.Int32
	release := make(chan struct{})
	board := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		puts.Add(1)
		w.Header().Set("Content-Type", "text/event-stream")
		flush := func() {
			if f, ok := w.(http.Flusher); ok {
				f.Flush()
			}
		}
		fmt.Fprint(w, "event: progress\ndata: {\"current\":10,\"total\":100}\n\n")
		flush()
		<-release // hold the download open, the way a real one outlives the call that asked for it
	}))
	defer board.Close()
	defer close(release)

	installs := NewModelInstaller()
	first, joined := installs.start(stubAccess{base: board.URL}, "m1")
	if joined {
		t.Fatal("the first call had nothing to join")
	}
	deadline := time.Now().Add(5 * time.Second)
	for {
		if _, total, _ := first.snapshot(); total > 0 {
			break
		}
		if !time.Now().Before(deadline) {
			t.Fatal("the download never reported progress")
		}
		time.Sleep(10 * time.Millisecond)
	}

	second, joined := installs.start(stubAccess{base: board.URL}, "m1")
	if !joined || second != first {
		t.Error("a retry must join the running download, not start a second one")
	}
	if got := puts.Load(); got != 1 {
		t.Errorf("the board saw %d download requests, want exactly 1", got)
	}
}
