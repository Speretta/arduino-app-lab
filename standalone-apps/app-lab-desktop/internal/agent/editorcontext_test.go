package agent

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"

	acp "github.com/coder/acp-go-sdk"
)

func inView(path, content string) *EditorContext {
	return &EditorContext{File: &EditorFile{Path: path, Content: content}}
}

// The file goes with its content once; after that the agent knows it, until it changes.
func TestEditorContextTextSendsTheFileOnlyWhenItIsNew(t *testing.T) {
	text, seen := editorContextText(editorSeen{}, inView("python/main.py", "import time\n"), false)
	if !strings.Contains(text, "The user is looking at python/main.py") || !strings.Contains(text, "<file path=\"python/main.py\">\nimport time\n") {
		t.Fatalf("first prompt = %q, want the file named and its content", text)
	}

	if again, _ := editorContextText(seen, inView("python/main.py", "import time\n"), false); again != "" {
		t.Fatalf("same file = %q, want nothing", again)
	}

	edited, _ := editorContextText(seen, inView("python/main.py", "import os\n"), false)
	if !strings.Contains(edited, "import os") {
		t.Fatalf("edited file = %q, want its new content", edited)
	}
}

// Back on a file it already has, the agent learns the switch, not the content again.
func TestEditorContextTextNamesAKnownFileByItsPath(t *testing.T) {
	_, seen := editorContextText(editorSeen{}, inView("python/main.py", "import time\n"), false)
	_, seen = editorContextText(seen, inView("sketch/sketch.ino", "void setup() {}\n"), false)

	text, _ := editorContextText(seen, inView("python/main.py", "import time\n"), false)
	if strings.Contains(text, "import time") || !strings.Contains(text, "python/main.py (unchanged since you last saw it)") {
		t.Fatalf("known file = %q, want its path alone", text)
	}
}

func TestEditorContextTextSendsTheSelectionOnce(t *testing.T) {
	ec := inView("python/main.py", "if a == True:\n    blink()\n")
	ec.Selection = &EditorSelection{Path: "python/main.py", StartLine: 1, EndLine: 1, Text: "if a == True:"}
	text, seen := editorContextText(editorSeen{}, ec, false)
	if !strings.Contains(text, "<selection path=\"python/main.py\" lines=\"1-1\">\nif a == True:\n</selection>") {
		t.Fatalf("selection = %q, want the selected lines", text)
	}
	if again, _ := editorContextText(seen, ec, false); again != "" {
		t.Fatalf("same selection = %q, want nothing", again)
	}
}

func TestEditorContextTextKeepsALargeFileToItsPath(t *testing.T) {
	big := strings.Repeat("a", maxEditorContent+1)
	text, seen := editorContextText(editorSeen{}, inView("data.csv", big), false)
	if strings.Contains(text, big) || !strings.Contains(text, "data.csv (too large to include; read it if you need it)") {
		t.Fatalf("large file = %d bytes, want its path alone", len(text))
	}
	if _, known := seen.files["data.csv"]; known {
		t.Fatal("a file the agent never got must not count as seen")
	}
}

func TestEditorContextTextSaysNothingWithoutAFile(t *testing.T) {
	if text, _ := editorContextText(editorSeen{}, &EditorContext{}, false); text != "" {
		t.Fatalf("no file = %q, want nothing", text)
	}
}

// The agent must not keep believing what changed: a save, a cleared selection, a file no longer in view.
func TestEditorContextTextAnnouncesWhatNoLongerHolds(t *testing.T) {
	unsaved := inView("python/main.py", "import time\n")
	unsaved.File.Unsaved = true
	unsaved.Selection = &EditorSelection{Path: "python/main.py", StartLine: 1, EndLine: 1, Text: "import time"}
	_, seen := editorContextText(editorSeen{}, unsaved, false)

	saved, seen := editorContextText(seen, inView("python/main.py", "import time\n"), false)
	if !strings.Contains(saved, "now saved to the board") || !strings.Contains(saved, "no longer has code selected") {
		t.Errorf("after the save and the deselection = %q, want both announced", saved)
	}

	if gone, _ := editorContextText(seen, &EditorContext{}, false); !strings.Contains(gone, "no text file in view") {
		t.Errorf("no file in view = %q, want it announced", gone)
	}
}

func TestEditorContextTextAnnouncesAKnownFileThatGrewTooLarge(t *testing.T) {
	_, seen := editorContextText(editorSeen{}, inView("data.csv", "a,b\n"), false)

	text, next := editorContextText(seen, inView("data.csv", strings.Repeat("a", maxEditorContent+1)), false)
	if !strings.Contains(text, "changed since you last saw it, and now too large") {
		t.Fatalf("grown file = %q, want the agent told its copy is stale", text)
	}
	if _, known := next.files["data.csv"]; known {
		t.Fatal("the stale copy must not count as seen")
	}
}

func TestSlashCommandMatchesWhatTheCLIRuns(t *testing.T) {
	for text, want := range map[string]string{"/review main.py": "review", "/compact": "compact", "/mcp:board:tool x": "mcp:board:tool"} {
		if got, ok := slashCommand(text); !ok || got != want {
			t.Errorf("slashCommand(%q) = %q, %v; want %q", text, got, ok, want)
		}
	}
	for _, text := range []string{"// does this loop block?", "/etc/hosts is a file", "what does /review do?", ""} {
		if _, ok := slashCommand(text); ok {
			t.Errorf("slashCommand(%q) = command, want a plain message", text)
		}
	}
}

// recordingConn keeps what each prompt carried ahead of its text.
type recordingConn struct {
	fakeConn
	befores [][]string
	err     error
	during  func() // runs while the turn is in flight
}

func (r *recordingConn) Prompt(_ context.Context, _ SessionID, _ string, before []string) error {
	r.befores = append(r.befores, before)
	if r.during != nil {
		r.during()
	}
	return r.err
}

// A new session's first prompt names the file without its text (the CLI titles the session from it); the next one brings the text.
func TestManagerSendsWhatTheAgentHasNotSeenOfTheEditor(t *testing.T) {
	m, conn, sid := startRecording(t)
	ctx := context.Background()
	ec := inView("python/main.py", "import time\n")

	conn.err = errors.New("overloaded")
	_ = m.Prompt(ctx, sid, "what does it do?", ec)
	conn.err = nil
	_ = m.Prompt(ctx, sid, "what does it do?", ec)
	_ = m.Prompt(ctx, sid, "and now?", ec)
	_ = m.Prompt(ctx, sid, "and again?", ec)
	_ = m.Prompt(ctx, sid, "/review", inView("python/main.py", "import os\n"))
	_ = m.Prompt(ctx, sid, "from Agent Mode", nil)

	if len(conn.befores) != 6 {
		t.Fatalf("got %d prompts, want 6", len(conn.befores))
	}
	if len(conn.befores[1]) != 1 || !strings.Contains(conn.befores[1][0], "its text is not included") {
		t.Errorf("first prompt after a failed one = %v, want the file named without its text", conn.befores[1])
	}
	if len(conn.befores[2]) != 1 || !strings.Contains(conn.befores[2][0], "<file path=\"python/main.py\">\nimport time\n") {
		t.Errorf("second prompt = %v, want the file's text", conn.befores[2])
	}
	for i, why := range map[int]string{3: "nothing new", 4: "a slash command", 5: "no editor"} {
		if conn.befores[i] != nil {
			t.Errorf("prompt %d (%s) carried %v, want nothing", i, why, conn.befores[i])
		}
	}
}

func TestToUpdateDropsTheEditorContextOfAReplayedPrompt(t *testing.T) {
	replayed := func(text string) acp.SessionUpdate {
		return acp.SessionUpdate{UserMessageChunk: &acp.SessionUpdateUserMessageChunk{Content: acp.TextBlock(text)}}
	}
	if _, ok := toUpdate(replayed("<editor-context>\nThe user is looking at python/main.py in the code editor beside this chat.\n</editor-context>")); ok {
		t.Error("the editor context must not come back as a user message")
	}
	if u, ok := toUpdate(replayed("what does this code do?")); !ok || u.Delta != "what does this code do?" {
		t.Errorf("user text = %+v, %v; want it kept", u, ok)
	}
	if u, ok := toUpdate(replayed("<editor-context>\nThe user is looking at a.py in the code editor beside this chat.\n</editor-context>\nwhat does this code do?")); !ok || u.Delta != "what does this code do?" {
		t.Errorf("joined chunk = %+v, %v; want the user text alone", u, ok)
	}
}

func startRecording(t *testing.T) (*Manager, *recordingConn, SessionID) {
	t.Helper()
	conn := &recordingConn{}
	m := NewManager(stayAlive(),
		func(_ io.Writer, _ io.Reader, h ClientHandler) (AgentConn, error) {
			conn.handler = h
			return conn, nil
		},
		ManagerConfig{})
	ctx := context.Background()
	if err := m.Start(ctx); err != nil {
		t.Fatalf("start: %v", err)
	}
	t.Cleanup(func() { _ = m.Stop() })
	sid, err := m.NewSession(ctx, "/tmp", SessionWorkspace{})
	if err != nil {
		t.Fatalf("new session: %v", err)
	}
	return m, conn, sid
}

// Stopped before the CLI took the prompt, the turn may have dropped it, so the agent never saw the file.
func TestManagerResendsTheEditorAfterAStoppedTurn(t *testing.T) {
	m, conn, sid := startRecording(t)
	ctx := context.Background()
	ec := inView("python/main.py", "import time\n")
	_ = m.Prompt(ctx, sid, "hello", nil) // the session's first prompt, which the CLI titles it from

	conn.during = func() { _ = m.Cancel(ctx, sid) }
	_ = m.Prompt(ctx, sid, "what does it do?", ec)
	conn.during = nil
	_ = m.Prompt(ctx, sid, "what does it do?", ec)

	if len(conn.befores[2]) != 1 {
		t.Fatalf("after a stopped turn = %v, want the context again", conn.befores[2])
	}
}

// Compaction or /clear leaves the agent without the file it was shown.
func TestManagerResendsTheEditorAfterTheContextShrinks(t *testing.T) {
	m, conn, sid := startRecording(t)
	ctx := context.Background()
	ec := inView("python/main.py", "import time\n")
	_ = m.Prompt(ctx, sid, "hello", nil) // the session's first prompt, which the CLI titles it from

	_ = m.Prompt(ctx, sid, "what does it do?", ec)
	m.HandleUpdate(sid, Update{Type: "usage", UsedTokens: 120000})
	m.HandleUpdate(sid, Update{Type: "usage", UsedTokens: 30000})
	_ = m.Prompt(ctx, sid, "and now?", ec)
	_ = m.Prompt(ctx, sid, "/clear", ec)
	_ = m.Prompt(ctx, sid, "and after clearing?", ec)

	if len(conn.befores[2]) != 1 {
		t.Errorf("after compaction = %v, want the context again", conn.befores[2])
	}
	if conn.befores[3] != nil || len(conn.befores[4]) != 1 {
		t.Errorf("around /clear = %v then %v, want nothing with the command and the context after it", conn.befores[3], conn.befores[4])
	}
}

// The block may hold a file that itself contains the closing tag.
func TestToUpdateStripsABlockWhoseFileHoldsTheClosingTag(t *testing.T) {
	text, _ := editorContextText(editorSeen{}, inView("a.py", "print('</editor-context>')\n"), false)
	replayed := acp.SessionUpdate{UserMessageChunk: &acp.SessionUpdateUserMessageChunk{Content: acp.TextBlock(text)}}
	if u, ok := toUpdate(replayed); ok {
		t.Fatalf("replayed block = %+v, want it dropped whole", u)
	}
}

func TestEditorContextTextNamesTheFileWithoutItsTextWhenAsked(t *testing.T) {
	text, seen := editorContextText(editorSeen{}, inView("python/main.py", "import time\n"), true)
	if strings.Contains(text, "import time") || !strings.Contains(text, "python/main.py (its text is not included here; read it if you need it)") {
		t.Fatalf("path only = %q, want the file named without its text", text)
	}
	if _, known := seen.files["python/main.py"]; known {
		t.Fatal("a text the agent never got must not count as seen")
	}
}

// A compaction during the turn may drop what the turn's own prompt showed, so the turn must not record it as seen.
func TestManagerKeepsAResetThatHappensDuringTheTurn(t *testing.T) {
	m, conn, sid := startRecording(t)
	ctx := context.Background()
	ec := inView("python/main.py", "import time\n")
	_ = m.Prompt(ctx, sid, "hello", nil) // the session's first prompt, which the CLI titles it from
	m.HandleUpdate(sid, Update{Type: "usage", UsedTokens: 120000})

	conn.during = func() { m.HandleUpdate(sid, Update{Type: "usage", UsedTokens: 30000}) }
	_ = m.Prompt(ctx, sid, "what does it do?", ec)
	conn.during = nil
	_ = m.Prompt(ctx, sid, "what does it do?", ec)

	if len(conn.befores[2]) != 1 || !strings.Contains(conn.befores[2][0], "import time") {
		t.Fatalf("after a compaction during the turn = %v, want the file's text again", conn.befores[2])
	}
}

// A first prompt stopped before the CLI took it gave the session no title, so the next one must still leave the text out.
func TestManagerKeepsTheFirstPromptLightAfterAStoppedOne(t *testing.T) {
	m, conn, sid := startRecording(t)
	ctx := context.Background()
	ec := inView("python/main.py", "import time\n")

	conn.during = func() { _ = m.Cancel(ctx, sid) }
	_ = m.Prompt(ctx, sid, "what does it do?", ec)
	conn.during = nil
	_ = m.Prompt(ctx, sid, "what does it do?", ec)

	if len(conn.befores[1]) != 1 || strings.Contains(conn.befores[1][0], "import time") {
		t.Fatalf("after a stopped first prompt = %v, want the file named without its text", conn.befores[1])
	}
}
