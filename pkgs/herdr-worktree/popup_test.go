package main

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

func testModel(t *testing.T, launch func(JobSpec) error) popupModel {
	t.Helper()
	t.Setenv("HERDR_PLUGIN_STATE_DIR", t.TempDir())
	t.Setenv("HERDR_CONFIG_PATH", filepath.Join(t.TempDir(), "absent.toml"))
	cfg := Config{Agents: map[string]agentConfig{
		"claude": {Models: []string{"opus", "haiku"}, Efforts: []string{"high", "low"}},
		"codex":  {Models: []string{"gpt"}, Efforts: []string{"low"}},
	}}
	m := newPopupModel(cfg, nil, launch)
	m.repo, m.hasRepo = repoInfo{Root: "/r", Name: "r", Base: "main"}, true
	m.base.SetValue("main")
	m.layout()
	return m
}

func send(m popupModel, msgs ...tea.Msg) popupModel {
	for _, msg := range msgs {
		next, _ := m.Update(msg)
		m = next.(popupModel)
	}
	return m
}

func keyMsg(s string) tea.KeyPressMsg {
	switch s {
	case "enter":
		return tea.KeyPressMsg{Code: tea.KeyEnter}
	case "shift+enter":
		return tea.KeyPressMsg{Code: tea.KeyEnter, Mod: tea.ModShift}
	case "tab":
		return tea.KeyPressMsg{Code: tea.KeyTab}
	case "right":
		return tea.KeyPressMsg{Code: tea.KeyRight}
	case "ctrl+o":
		return tea.KeyPressMsg{Code: 'o', Mod: tea.ModCtrl}
	case "esc":
		return tea.KeyPressMsg{Code: tea.KeyEscape}
	}
	return tea.KeyPressMsg{Code: []rune(s)[0], Text: s}
}

func paste(s string) tea.PasteMsg { return tea.PasteMsg{Content: s} }

func TestContextCwds(t *testing.T) {
	raw := `{"workspace_cwd":"/w","focused_pane_cwd":"/p","worktree":{"checkout_path":"/c"}}`
	if got := contextCwds(raw); !reflect.DeepEqual(got, []string{"/c", "/w", "/p"}) {
		t.Errorf("got %v", got)
	}
	if got := contextCwds(`{"workspace_cwd":"/w","focused_pane_cwd":"/w"}`); !reflect.DeepEqual(got, []string{"/w"}) {
		t.Errorf("got %v", got)
	}
	if got := contextCwds("not json"); got != nil {
		t.Errorf("got %v", got)
	}
}

func TestMultiLinePasteDoesNotLaunch(t *testing.T) {
	launched := false
	m := testModel(t, func(JobSpec) error { launched = true; return nil })
	text := "line one\nline two\n\n  line four"
	m = send(m, paste(text))
	if launched {
		t.Fatal("paste launched the job")
	}
	if got := m.prompt.Value(); got != text {
		t.Errorf("value = %q", got)
	}
}

func TestLongPasteIsKept(t *testing.T) {
	m := testModel(t, func(JobSpec) error { return nil })
	text := strings.Repeat(strings.Repeat("x", 1200)+"\n", 150) + "end"
	m = send(m, paste(text))
	if got := m.prompt.Value(); got != text {
		t.Errorf("length = %d, want %d", len(got), len(text))
	}
}

func TestEnterLaunchesSelection(t *testing.T) {
	var spec JobSpec
	m := testModel(t, func(s JobSpec) error { spec = s; return nil })
	m = send(m, keyMsg("hello"), keyMsg("shift+enter"), keyMsg("world"), keyMsg("ctrl+o"), keyMsg("tab"), keyMsg("tab"), keyMsg("right"), keyMsg("enter"))
	want := JobSpec{
		Selection: Selection{Agent: "claude", Model: "haiku", Effort: "high"},
		Repo:      "/r", RepoName: "r", Prompt: "hello\nworld", Base: "main",
	}
	if !reflect.DeepEqual(spec, want) {
		t.Errorf("spec = %+v", spec)
	}
}

func TestShiftEnterAddsLineWithoutLaunch(t *testing.T) {
	launched := false
	m := testModel(t, func(JobSpec) error { launched = true; return nil })
	m = send(m, keyMsg("one"), keyMsg("shift+enter"), keyMsg("two"))
	if launched {
		t.Fatal("shift+enter launched the job")
	}
	if got := m.prompt.Value(); got != "one\ntwo" {
		t.Errorf("prompt = %q", got)
	}
}

func TestTitleIsPromptNotPopupName(t *testing.T) {
	view := testModel(t, nil).render()
	if !strings.Contains(view, "Prompt") || strings.Contains(view, "New worktree") {
		t.Errorf("view = %q", view)
	}
}

func TestHelpHasNoNewlineHint(t *testing.T) {
	m := testModel(t, nil)
	if view := m.render(); strings.Contains(view, "ctrl+j") || strings.Contains(view, "newline") {
		t.Errorf("view = %q", view)
	}
}

func TestViewFitsPopup(t *testing.T) {
	check := func(name string, msgs ...tea.Msg) {
		t.Helper()
		m := send(testModel(t, func(JobSpec) error { return nil }), msgs...)
		view := m.render()
		if got := lipgloss.Height(view); got != m.height {
			t.Errorf("%s: height = %d, want %d", name, got, m.height)
		}
		if got := lipgloss.Width(view); got > m.width {
			t.Errorf("%s: width = %d, want at most %d", name, got, m.width)
		}
	}
	check("closed")
	check("options", keyMsg("ctrl+o"))
	check("opencode", keyMsg("ctrl+o"), keyMsg("tab"), keyMsg("right"), keyMsg("right"), keyMsg("right"))
	check("message", keyMsg("enter"))
}

func TestEnterNeedsPromptAndRepo(t *testing.T) {
	launched := false
	m := testModel(t, func(JobSpec) error { launched = true; return nil })
	if m = send(m, keyMsg("enter")); launched || m.message == "" {
		t.Errorf("empty prompt: launched=%v message=%q", launched, m.message)
	}
	m = testModel(t, func(JobSpec) error { launched = true; return nil })
	m.hasRepo = false
	if m = send(m, keyMsg("text"), keyMsg("enter")); launched || !strings.Contains(m.message, "Not a Git repository") {
		t.Errorf("no repo: launched=%v message=%q", launched, m.message)
	}
}

func TestOpencodeHidesModelAndEffort(t *testing.T) {
	m := testModel(t, nil)
	m = send(m, keyMsg("ctrl+o"), keyMsg("tab")) // agent field
	for range 3 {                                // claude -> codex -> pi -> opencode
		m = send(m, keyMsg("right"))
	}
	if m.agent != "opencode" {
		t.Fatalf("agent = %q", m.agent)
	}
	if strings.Contains(m.render(), "effort") {
		t.Error("the effort field is visible")
	}
	if m = send(m, keyMsg("tab")); m.focus != fieldBranch {
		t.Errorf("focus = %v", m.focus)
	}
	m.showOptions = false
	if got := m.chipValues(); !reflect.DeepEqual(got, []string{"opencode", "⎇ main"}) {
		t.Errorf("chips = %q", got)
	}
}

func TestEscSavesDraftAndNextOpenRestores(t *testing.T) {
	m := testModel(t, nil)
	m = send(m, keyMsg("my task"), keyMsg("ctrl+o"), keyMsg("tab"), keyMsg("tab"), keyMsg("right"))
	next, cmd := m.Update(keyMsg("esc"))
	if cmd == nil {
		t.Fatal("esc did not quit")
	}
	_ = next
	d, ok := loadDraft()
	if !ok || d.Prompt != "my task" || d.Model != "haiku" || d.Base != "" {
		t.Fatalf("draft = %+v, %v", d, ok)
	}
	cfg := Config{Agents: m.cfg.Agents}
	again := newPopupModel(cfg, nil, nil)
	if got := again.prompt.Value(); got != "my task" {
		t.Errorf("prompt = %q", got)
	}
	if got := again.selections["claude"].Model; got != "haiku" {
		t.Errorf("model = %q", got)
	}
}

func TestEscWithEmptyPromptClearsDraft(t *testing.T) {
	m := testModel(t, nil)
	if err := saveDraft(Draft{Prompt: "old"}); err != nil {
		t.Fatal(err)
	}
	m.Update(keyMsg("esc"))
	if _, ok := loadDraft(); ok {
		t.Error("the draft is still there")
	}
}

func TestKeepDraftKeepsOtherPrompt(t *testing.T) {
	testModel(t, nil)
	for _, p := range []string{"first", "second"} {
		if err := keepDraft(Draft{Prompt: p}); err != nil {
			t.Fatal(err)
		}
	}
	entries, err := os.ReadDir(os.Getenv("HERDR_PLUGIN_STATE_DIR"))
	if err != nil || len(entries) != 2 {
		t.Fatalf("entries = %v, err = %v", entries, err)
	}
	if d, _ := loadDraft(); d.Prompt != "second" {
		t.Errorf("draft = %+v", d)
	}
}

func TestEscReplacesDraftWithoutCopies(t *testing.T) {
	m := testModel(t, nil)
	for _, text := range []string{"one", " two"} {
		m = send(m, keyMsg(text))
		if _, cmd := m.Update(keyMsg("esc")); cmd == nil {
			t.Fatal("esc did not quit")
		}
	}
	entries, err := os.ReadDir(os.Getenv("HERDR_PLUGIN_STATE_DIR"))
	if err != nil || len(entries) != 1 {
		t.Fatalf("entries = %v, err = %v", entries, err)
	}
}

func TestPrefsPerAgent(t *testing.T) {
	testModel(t, nil)
	if err := savePrefs(Selection{Agent: "codex", Model: "gpt", Effort: "low"}); err != nil {
		t.Fatal(err)
	}
	if err := savePrefs(Selection{Agent: "claude", Model: "haiku", Effort: "low"}); err != nil {
		t.Fatal(err)
	}
	p := loadPrefs()
	if p.Agent != "claude" || p.Agents["codex"].Model != "gpt" || p.Agents["claude"].Model != "haiku" {
		t.Errorf("prefs = %+v", p)
	}
}
