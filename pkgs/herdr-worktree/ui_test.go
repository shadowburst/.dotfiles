package main

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

type recorder struct {
	specs    []JobSpec
	opened   []string
	runs     [][]string
	finished []string
	reloads  int
	lines    []string
	err      error
}

func (r *recorder) ops() ops {
	return ops{
		launch: func(s JobSpec) error { r.specs = append(r.specs, s); return nil },
		open:   func(row row) error { r.opened = append(r.opened, row.Branch); return nil },
		finish: func(row, main row, focusMain bool) error {
			r.finished = append(r.finished, row.Branch+map[bool]string{true: " +main", false: ""}[focusMain])
			return nil
		},
		run: func(dir string, args ...string) *stream {
			r.runs = append(r.runs, append([]string{dir}, args...))
			s := &stream{lines: make(chan string, len(r.lines)), err: make(chan error, 1)}
			for _, l := range r.lines {
				s.lines <- l
			}
			close(s.lines)
			s.err <- r.err
			return s
		},
		reload: func(string) tea.Msg { r.reloads++; return nil },
	}
}

func testRows() []row {
	return []row{
		{Branch: "main", Path: "/r", Main: true, Workspaces: []string{"w1"}},
		{Branch: "feat/a", Path: "/wt/a", Ahead: 2, Dirty: true, Agent: "claude", Workspaces: []string{"w2"}},
		{Branch: "feat/busy", Path: "/wt/busy", Agent: "codex", Busy: true},
		{Branch: "feat/c", Path: "/wt/c", Workspaces: []string{"w3"}},
		{Branch: "feat/b"},
		{Branch: "done", Merged: true},
		{Branch: "only-remote", Remote: "origin"},
	}
}

func testUI(t *testing.T, rec *recorder) uiModel {
	t.Helper()
	t.Setenv("HERDR_PLUGIN_STATE_DIR", t.TempDir())
	t.Setenv("HERDR_CONFIG_PATH", filepath.Join(t.TempDir(), "absent.toml"))
	cfg := Config{Agents: map[string]agentConfig{
		"claude": {Models: []string{"opus", "haiku"}, Efforts: []string{"high", "low"}},
		"codex":  {Models: []string{"gpt"}, Efforts: []string{"low"}},
	}}
	names := branchSet{
		names:  []string{"done", "feat/a", "feat/b", "feat/busy", "feat/c", "main", "only-remote"},
		local:  map[string]bool{"done": true, "feat/a": true, "feat/b": true, "feat/busy": true, "feat/c": true, "main": true},
		remote: map[string]bool{"only-remote": true},
	}
	m := newUIModel(cfg, newStyles(loadPalette()), repoInfo{Root: "/r", Name: "r", Base: "main"}, true, names, rec.ops())
	m.width, m.height = 120, 30
	m.focusedPath = "/wt/a"
	m.setRows("main", testRows())
	return m
}

// send runs the stream of a merge or a removal to its end.
func send(m uiModel, msgs ...tea.Msg) uiModel {
	for _, msg := range msgs {
		next, _ := m.Update(msg)
		m = next.(uiModel)
		for m.stream != nil && !m.failed && m.view != viewList {
			before := m.stream
			next, _ = m.Update(m.stream.next()())
			m = next.(uiModel)
			if m.stream != before {
				break
			}
		}
	}
	return m
}

func quits(m uiModel, msg tea.Msg) bool {
	_, cmd := m.Update(msg)
	if cmd == nil {
		return false
	}
	_, ok := cmd().(tea.QuitMsg)
	return ok
}

func keyMsg(s string) tea.KeyPressMsg {
	switch s {
	case "enter":
		return tea.KeyPressMsg{Code: tea.KeyEnter}
	case "shift+enter":
		return tea.KeyPressMsg{Code: tea.KeyEnter, Mod: tea.ModShift}
	case "tab":
		return tea.KeyPressMsg{Code: tea.KeyTab}
	case "esc":
		return tea.KeyPressMsg{Code: tea.KeyEscape}
	}
	return tea.KeyPressMsg{Code: []rune(s)[0], Text: s}
}

func keys(ks ...string) []tea.Msg {
	var msgs []tea.Msg
	for _, k := range ks {
		msgs = append(msgs, keyMsg(k))
	}
	return msgs
}

func paste(s string) tea.PasteMsg { return tea.PasteMsg{Content: s} }

func selected(m uiModel) string {
	r, _ := m.current()
	return r.Branch
}

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

func TestListSelectsFocusedWorktree(t *testing.T) {
	if got := selected(testUI(t, &recorder{})); got != "feat/a" {
		t.Errorf("selected = %q", got)
	}
}

func TestRemoteRowsShow(t *testing.T) {
	m := testUI(t, &recorder{})
	if !strings.Contains(m.render(), "only-remote") {
		t.Error("a remote row does not show without a filter")
	}
	m = send(m, keys("/", "r", "e", "m")...)
	if got := selected(m); got != "only-remote" {
		t.Errorf("selected = %q", got)
	}
	if m = send(m, keyMsg("esc")); m.filter.Value() != "" || m.filtering {
		t.Errorf("esc kept the filter %q", m.filter.Value())
	}
}

func TestEnterOpensWorktree(t *testing.T) {
	rec := &recorder{}
	m := testUI(t, rec)
	if !quits(m, keyMsg("enter")) || !reflect.DeepEqual(rec.opened, []string{"feat/a"}) {
		t.Errorf("opened = %v", rec.opened)
	}
}

func TestEnterOnBranchStartsShellJob(t *testing.T) {
	rec := &recorder{}
	m := send(testUI(t, rec), keys("j", "j", "j")...)
	if !quits(m, keyMsg("enter")) {
		t.Fatal("enter did not quit")
	}
	want := []JobSpec{{Repo: "/r", RepoName: "r", Branch: "feat/b", Base: "main", Focus: true}}
	if !reflect.DeepEqual(rec.specs, want) {
		t.Errorf("specs = %+v", rec.specs)
	}
}

func TestNewLaunchesSelection(t *testing.T) {
	rec := &recorder{}
	m := send(testUI(t, rec), keys("n", "h", "i")...)
	m = send(m, keyMsg("shift+enter"), keyMsg("x"), keyMsg("tab"), keyMsg("j"), keyMsg("l"))
	if !quits(m, keyMsg("enter")) {
		t.Fatal("enter did not quit")
	}
	want := JobSpec{
		Selection: Selection{Agent: "claude", Model: "haiku", Effort: "high"},
		Repo:      "/r", RepoName: "r", Prompt: "hi\nx", Base: "feat/a",
	}
	if len(rec.specs) != 1 || !reflect.DeepEqual(rec.specs[0], want) {
		t.Errorf("specs = %+v", rec.specs)
	}
}

func TestPasteDoesNotLaunch(t *testing.T) {
	rec := &recorder{}
	text := "line one\nline two\n\n  line four"
	m := send(testUI(t, rec), keyMsg("n"), paste(text))
	if len(rec.specs) != 0 || m.form.prompt.Value() != text {
		t.Errorf("specs = %v, prompt = %q", rec.specs, m.form.prompt.Value())
	}
}

func TestNewNeedsPrompt(t *testing.T) {
	rec := &recorder{}
	m := send(testUI(t, rec), keys("n", "enter")...)
	if len(rec.specs) != 0 || m.message != "The prompt is empty." {
		t.Errorf("specs = %v, message = %q", rec.specs, m.message)
	}
}

func TestOpencodeHidesModelAndEffort(t *testing.T) {
	m := send(testUI(t, &recorder{}), keys("n", "tab", "l", "l", "l")...)
	if m.form.agent != "opencode" {
		t.Fatalf("agent = %q", m.form.agent)
	}
	if strings.Contains(m.render(), "effort") {
		t.Error("the effort field is visible")
	}
	if m = send(m, keyMsg("j")); m.form.focus != fieldBranch {
		t.Errorf("focus = %v", m.form.focus)
	}
}

func TestBranchCompletesAndShowsExisting(t *testing.T) {
	m := send(testUI(t, &recorder{}), keys("n", "tab", "tab", "tab", "tab", "f", "e", "a", "t", "/", "tab")...)
	if m.form.focus != fieldBranch || m.form.branch.Value() != "feat/a" {
		t.Fatalf("focus = %v, branch = %q", m.form.focus, m.form.branch.Value())
	}
	if !strings.Contains(m.render(), "exists") {
		t.Error("no exists hint")
	}
}

func TestEscInNewSavesDraftAndGoesBack(t *testing.T) {
	m := send(testUI(t, &recorder{}), keys("n", "m", "y", "tab", "j", "l", "esc")...)
	if m.view != viewList {
		t.Fatalf("view = %v", m.view)
	}
	d, ok := loadDraft()
	if !ok || d.Prompt != "my" || d.Model != "haiku" {
		t.Fatalf("draft = %+v, %v", d, ok)
	}
	again := newNewForm(m.form.cfg, m.st, m.repo, m.form.names)
	if again.prompt.Value() != "my" || again.selections["claude"].Model != "haiku" {
		t.Errorf("form = %q %+v", again.prompt.Value(), again.selections["claude"])
	}
	if !quits(m, keyMsg("esc")) {
		t.Error("esc in the list did not quit")
	}
}

func TestEscWithEmptyPromptClearsDraft(t *testing.T) {
	m := testUI(t, &recorder{})
	if err := saveDraft(Draft{Prompt: "old"}); err != nil {
		t.Fatal(err)
	}
	m.form.prompt.SetValue("")
	send(m, keys("n", "esc")...)
	if _, ok := loadDraft(); ok {
		t.Error("the draft is still there")
	}
}

func TestKeepDraftKeepsOtherPrompt(t *testing.T) {
	t.Setenv("HERDR_PLUGIN_STATE_DIR", t.TempDir())
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

func TestPrefsPerAgent(t *testing.T) {
	t.Setenv("HERDR_PLUGIN_STATE_DIR", t.TempDir())
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

func TestMergeRunsWtAndClosesTheSpace(t *testing.T) {
	rec := &recorder{lines: []string{"✓ Merged to main"}}
	m := send(testUI(t, rec), keyMsg("m"))
	if got := m.target.Value(); got != "main" {
		t.Errorf("target = %q", got)
	}
	m = send(m, keyMsg("enter"))
	if want := [][]string{{"/wt/a", "-C", "/wt/a", "merge", "main", "--yes"}}; !reflect.DeepEqual(rec.runs, want) {
		t.Errorf("runs = %v", rec.runs)
	}
	if !reflect.DeepEqual(rec.finished, []string{"feat/a +main"}) {
		t.Errorf("finished = %v", rec.finished)
	}
}

func TestMergeFailureKeepsOutput(t *testing.T) {
	rec := &recorder{lines: []string{"✗ conflict in a.go"}, err: errors.New("exit status 1")}
	m := send(testUI(t, rec), keys("m", "enter")...)
	if !m.failed || !strings.Contains(m.render(), "conflict in a.go") || len(rec.finished) != 0 {
		t.Fatalf("failed = %v, finished = %v", m.failed, rec.finished)
	}
	if m = send(m, keyMsg("enter")); m.view != viewList {
		t.Errorf("view = %v", m.view)
	}
}

func TestActionConfirmationKeys(t *testing.T) {
	for _, tt := range []struct {
		name, action string
		cursor       int
		want         []string
	}{
		{"merge", "m", 1, []string{"/wt/a", "-C", "/wt/a", "merge", "main", "--yes"}},
		{"remove worktree", "x", 3, []string{"/r", "-C", "/r", "remove", "feat/c", "--yes", "--foreground"}},
		{"remove both", "X", 3, []string{"/r", "-C", "/r", "remove", "feat/c", "--yes", "--foreground", "--force-delete"}},
		{"remove unmerged branch", "x", 4, []string{"/r", "-C", "/r", "remove", "feat/b", "--yes", "--foreground", "--force-delete"}},
		{"remove merged branch", "x", 5, []string{"/r", "-C", "/r", "remove", "done", "--yes", "--foreground"}},
	} {
		for _, key := range []string{"y", "enter"} {
			t.Run(tt.name+"/"+key, func(t *testing.T) {
				rec := &recorder{}
				m := testUI(t, rec)
				m.cursor = tt.cursor
				m = send(m, keyMsg(tt.action))
				if len(rec.runs) != 0 || !strings.Contains(m.render(), "y/⏎") {
					t.Fatalf("runs = %v, view:\n%s", rec.runs, m.render())
				}
				m = send(m, keyMsg(key))
				if !reflect.DeepEqual(rec.runs, [][]string{tt.want}) || len(rec.finished) != 1 {
					t.Errorf("runs = %v, finished = %v", rec.runs, rec.finished)
				}
			})
		}
	}
}

func TestRefusals(t *testing.T) {
	for _, tt := range []struct {
		name, key, want string
		moves           int
	}{
		{"merge main", "m", "main checkout", 0},
		{"merge busy", "m", "agent is working", 2},
		{"remove main", "x", "main checkout", 0},
		{"remove busy", "x", "agent is working", 2},
		{"remove both main", "X", "main checkout", 0},
		{"remove both busy", "X", "agent is working", 2},
		{"merge branch", "m", "no worktree", 4},
	} {
		rec := &recorder{}
		m := testUI(t, rec)
		m.cursor = tt.moves
		m = send(m, keyMsg(tt.key), keyMsg("y"), keyMsg("enter"))
		if !strings.Contains(m.render(), tt.want) || len(rec.runs) != 0 {
			t.Errorf("%s: runs = %v, view:\n%s", tt.name, rec.runs, m.render())
		}
	}
}

func TestRemoveDirtyWorktreeNeedsConfirmation(t *testing.T) {
	for _, removeKey := range []string{"x", "X"} {
		for _, key := range []string{"y", "enter", "n", "esc"} {
			t.Run(removeKey+"/"+key, func(t *testing.T) {
				rec := &recorder{}
				m := testUI(t, rec)
				m.focusedPath = ""
				m.cursor = 1 // feat/a has uncommitted changes
				m = send(m, keyMsg(removeKey))
				if m.view != viewRemove || !strings.Contains(m.render(), "Uncommitted changes will be lost.") || len(rec.runs) != 0 {
					t.Fatalf("runs = %v, view:\n%s", rec.runs, m.render())
				}
				if warned := strings.Contains(m.render(), "Unmerged commits will be lost."); warned != (removeKey == "X") {
					t.Errorf("branch warning = %v", warned)
				}
				m = send(m, keyMsg(key))
				if key == "y" || key == "enter" {
					want := [][]string{{"/r", "-C", "/r", "remove", "feat/a", "--yes", "--foreground", "--force"}}
					if removeKey == "X" {
						want[0] = append(want[0], "--force-delete")
					}
					if !reflect.DeepEqual(rec.runs, want) || !reflect.DeepEqual(rec.finished, []string{"feat/a"}) {
						t.Errorf("runs = %v, finished = %v", rec.runs, rec.finished)
					}
				} else if len(rec.runs) != 0 || len(rec.finished) != 0 {
					t.Errorf("cancelled removal: runs = %v, finished = %v", rec.runs, rec.finished)
				}
				if m.view != viewList {
					t.Errorf("view = %v", m.view)
				}
				if key == "n" || key == "esc" {
					m = send(m, keyMsg("x"))
					if strings.Contains(m.render(), "Unmerged commits will be lost.") {
						t.Error("cancelled branch deletion is still selected")
					}
				}
			})
		}
	}
}

func TestRemoveWorktreeAndBranch(t *testing.T) {
	for _, merged := range []bool{false, true} {
		rec := &recorder{}
		m := testUI(t, rec)
		m.cursor = 3 // feat/c has no uncommitted changes
		m.rows[3].Merged = merged
		m = send(m, keyMsg("X"))
		if !strings.Contains(m.render(), "Remove worktree and branch.") || len(rec.runs) != 0 {
			t.Fatalf("runs = %v, view:\n%s", rec.runs, m.render())
		}
		if warned := strings.Contains(m.render(), "Unmerged commits will be lost."); warned == merged {
			t.Errorf("merged = %v, warning = %v", merged, warned)
		}
		m = send(m, keyMsg("y"))
		want := [][]string{{"/r", "-C", "/r", "remove", "feat/c", "--yes", "--foreground", "--force-delete"}}
		if !reflect.DeepEqual(rec.runs, want) || m.view != viewList || !reflect.DeepEqual(rec.finished, []string{"feat/c"}) {
			t.Errorf("runs = %v, view = %v, finished = %v", rec.runs, m.view, rec.finished)
		}
	}
}

func TestRemoveOtherWorktreeGoesBackToList(t *testing.T) {
	rec := &recorder{}
	m := testUI(t, rec)
	m.cursor = 3 // feat/c
	m = send(m, keys("x", "y")...)
	if want := [][]string{{"/r", "-C", "/r", "remove", "feat/c", "--yes", "--foreground"}}; !reflect.DeepEqual(rec.runs, want) {
		t.Errorf("runs = %v", rec.runs)
	}
	if m.view != viewList || m.message != "Removed feat/c" || !reflect.DeepEqual(rec.finished, []string{"feat/c"}) {
		t.Errorf("view = %v, message = %q, finished = %v", m.view, m.message, rec.finished)
	}
}

func TestRemoveRemoteBranchIsRefused(t *testing.T) {
	rec := &recorder{}
	m := testUI(t, rec)
	m = send(m, keys("/", "o", "n", "l", "y", "enter", "x", "y")...)
	if m.sel.Branch != "only-remote" {
		t.Fatalf("selected %q", m.sel.Branch)
	}
	if !strings.Contains(m.render(), "only on origin") || len(rec.runs) != 0 {
		t.Errorf("runs = %v, view:\n%s", rec.runs, m.render())
	}
}

func TestRemoveBranch(t *testing.T) {
	for _, tt := range []struct {
		branch string
		cursor int
		force  bool
	}{
		{"done", 5, false},
		{"feat/b", 4, true},
	} {
		rec := &recorder{}
		m := testUI(t, rec)
		m.focusedPath = ""
		m.cursor = tt.cursor
		m = send(m, keyMsg("x"))
		if m.sel.Branch != tt.branch {
			t.Fatalf("selected %q, want %q", m.sel.Branch, tt.branch)
		}
		if warned := strings.Contains(m.render(), "Unmerged commits will be lost."); warned != tt.force {
			t.Errorf("%s: warning = %v", tt.branch, warned)
		}
		m = send(m, keyMsg("y"))
		want := []string{"/r", "-C", "/r", "remove", tt.branch, "--yes", "--foreground"}
		if tt.force {
			want = append(want, "--force-delete")
		}
		if !reflect.DeepEqual(rec.runs, [][]string{want}) {
			t.Errorf("%s: runs = %v", tt.branch, rec.runs)
		}
		if m.view != viewList || m.message != "Removed "+tt.branch || !reflect.DeepEqual(rec.finished, []string{tt.branch}) {
			t.Errorf("%s: view = %v, message = %q, finished = %v", tt.branch, m.view, m.message, rec.finished)
		}
	}
}

func TestRemoveFocusedWorktreeFocusesMain(t *testing.T) {
	rec := &recorder{}
	m := testUI(t, rec)
	m.focusedPath = "/wt/c"
	m.cursor = 3
	m = send(m, keyMsg("x"))
	_, cmd := m.Update(keyMsg("y"))
	next, cmd := m.Update(cmd())
	if _, ok := cmd().(tea.QuitMsg); !ok || next.(uiModel).view != viewRemove {
		t.Error("removing the focused worktree did not quit")
	}
	if !reflect.DeepEqual(rec.finished, []string{"feat/c +main"}) {
		t.Errorf("finished = %v", rec.finished)
	}
}

func TestViewFitsPopup(t *testing.T) {
	for _, size := range [][2]int{{120, 30}, {70, 16}, {160, 40}} {
		for name, ks := range map[string][]string{
			"list": nil, "filter": {"/", "f"}, "new": {"n"}, "opencode": {"n", "tab", "l", "l", "l"},
			"merge": {"m"}, "remove": {"x"}, "remove both": {"X"}, "message": {"n", "enter"},
		} {
			m := testUI(t, &recorder{})
			m.width, m.height = size[0], size[1]
			m = send(m, keys(ks...)...)
			view := m.render()
			if got := lipgloss.Height(view); got != m.height {
				t.Errorf("%s %v: height = %d", name, size, got)
			}
			if got := lipgloss.Width(view); got > m.width {
				t.Errorf("%s %v: width = %d", name, size, got)
			}
		}
	}
}
