package main

// The New view: the prompt, then the agent, model, effort, branch and base.

import (
	"fmt"
	"image/color"
	"math"
	"slices"
	"strings"

	"charm.land/bubbles/v2/key"
	"charm.land/bubbles/v2/textarea"
	"charm.land/bubbles/v2/textinput"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"
)

type field int

const (
	fieldPrompt field = iota
	fieldAgent
	fieldModel
	fieldEffort
	fieldBranch
	fieldBase
	fieldCount
)

var fieldLabels = [fieldCount]string{"prompt", "agent", "model", "effort", "branch", "base"}

type formAction int

const (
	formNone formAction = iota
	formSubmit
	formBack
)

type newForm struct {
	cfg   Config
	st    styles
	repo  repoInfo
	names branchSet

	prompt textarea.Model
	branch textinput.Model
	base   textinput.Model

	agent      string
	selections map[string]Selection
	focus      field

	width, height int
}

func newNewForm(cfg Config, st styles, repo repoInfo, names branchSet) newForm {
	ta := textarea.New()
	ta.ShowLineNumbers = false
	ta.CharLimit = 0
	ta.MaxWidth = 0
	// The textarea is only as tall as its text, and resize sets MaxHeight to
	// the box. View runs on each key press, and a full-height textarea
	// measures every empty cell, which makes dictation slow.
	ta.DynamicHeight = true
	ta.MaxContentHeight = math.MaxInt
	ta.Prompt = ""
	ta.Placeholder = "Prompt"
	taStyles := ta.Styles()
	taStyles.Cursor.Color = st.accent
	for _, state := range []*textarea.StyleState{&taStyles.Focused, &taStyles.Blurred} {
		state.CursorLine = lipgloss.NewStyle()
		state.Text = lipgloss.NewStyle().Foreground(st.text)
		state.Placeholder = st.dim
	}
	ta.SetStyles(taStyles)
	ta.KeyMap.InsertNewline = key.NewBinding(key.WithKeys("shift+enter", "alt+enter", "ctrl+j"))

	f := newForm{
		cfg: cfg, st: st, repo: repo, names: names, prompt: ta,
		branch: branchInput(st, names), base: branchInput(st, names),
		selections: map[string]Selection{},
	}
	p := loadPrefs()
	f.agent = agentKinds[0]
	if slices.Contains(agentKinds, p.Agent) {
		f.agent = p.Agent
	}
	for _, kind := range agentKinds {
		f.selections[kind] = f.validSelection(p.Agents[kind], kind)
	}
	f.base.SetValue(repo.Base)
	if d, ok := loadDraft(); ok {
		f.prompt.SetValue(d.Prompt)
		f.branch.SetValue(d.Branch)
		if slices.Contains(agentKinds, d.Agent) {
			f.agent = d.Agent
			f.selections[d.Agent] = f.validSelection(d.Selection, d.Agent)
		}
		if d.Base != "" && d.Repo == repo.Root {
			f.base.SetValue(d.Base)
		}
	}
	return f
}

// branchInput completes the branch names. Tab accepts, ↓/↑ go through the matches.
func branchInput(st styles, names branchSet) textinput.Model {
	in := textinput.New()
	in.Prompt = ""
	in.ShowSuggestions = true
	in.SetSuggestions(names.names)
	inStyles := in.Styles()
	inStyles.Cursor.Color = st.accent
	for _, state := range []*textinput.StyleState{&inStyles.Focused, &inStyles.Blurred} {
		state.Text = lipgloss.NewStyle().Foreground(st.text)
		state.Placeholder = st.dim
		state.Suggestion = st.dim
	}
	in.SetStyles(inStyles)
	return in
}

// validSelection replaces values that the config no longer lists.
func (f newForm) validSelection(s Selection, kind string) Selection {
	s.Agent = kind
	s.Model = validChoice(s.Model, f.cfg.Agents[kind].Models)
	s.Effort = validChoice(s.Effort, f.cfg.Agents[kind].Efforts)
	if !agentHasModel(kind) {
		s.Model, s.Effort = "", ""
	}
	return s
}

func validChoice(value string, choices []string) string {
	if slices.Contains(choices, value) {
		return value
	}
	if len(choices) > 0 {
		return choices[0]
	}
	return ""
}

func (f *newForm) hasDraft() bool { return strings.TrimSpace(f.prompt.Value()) != "" }

func (f *newForm) visible(x field) bool {
	if x == fieldModel || x == fieldEffort {
		return agentHasModel(f.agent)
	}
	return true
}

func (f *newForm) isText() bool {
	return f.focus == fieldPrompt || f.focus == fieldBranch || f.focus == fieldBase
}

func (f *newForm) setFocus(x field) tea.Cmd {
	f.focus = x
	f.prompt.Blur()
	f.branch.Blur()
	f.base.Blur()
	switch x {
	case fieldPrompt:
		return f.prompt.Focus()
	case fieldBranch:
		return f.branch.Focus()
	case fieldBase:
		return f.base.Focus()
	}
	return nil
}

func (f *newForm) move(step int) tea.Cmd {
	next := f.focus
	for {
		next = (next + field(step) + fieldCount) % fieldCount
		if f.visible(next) {
			break
		}
	}
	return f.setFocus(next)
}

func cycle(value string, choices []string, step int) string {
	if len(choices) == 0 {
		return value
	}
	i := slices.Index(choices, value)
	return choices[(i+step+len(choices))%len(choices)]
}

func (f *newForm) cycle(step int) {
	sel := f.selections[f.agent]
	options := f.cfg.Agents[f.agent]
	switch f.focus {
	case fieldAgent:
		f.agent = cycle(f.agent, agentKinds, step)
		return
	case fieldModel:
		sel.Model = cycle(sel.Model, options.Models, step)
	case fieldEffort:
		sel.Effort = cycle(sel.Effort, options.Efforts, step)
	}
	f.selections[f.agent] = sel
}

func (f *newForm) input() *textinput.Model {
	switch f.focus {
	case fieldBranch:
		return &f.branch
	case fieldBase:
		return &f.base
	}
	return nil
}

// canComplete is true when Tab would complete a suggestion.
func (f *newForm) canComplete() bool {
	in := f.input()
	if in == nil {
		return false
	}
	s := in.CurrentSuggestion()
	return s != "" && s != in.Value()
}

func (f *newForm) updateFocused(msg tea.Msg) tea.Cmd {
	var cmd tea.Cmd
	switch f.focus {
	case fieldPrompt:
		f.prompt, cmd = f.prompt.Update(msg)
	case fieldBranch:
		f.branch, cmd = f.branch.Update(msg)
	case fieldBase:
		f.base, cmd = f.base.Update(msg)
	}
	return cmd
}

// resize fits the fields to the body of the popup: w x h cells.
func (f *newForm) resize(w, h int) {
	f.width, f.height = w, h
	f.prompt.MaxHeight = f.boxHeight() - f.st.frame.GetVerticalFrameSize()
	f.prompt.SetWidth(max(w-f.st.frame.GetHorizontalFrameSize(), 10))
}

func (f *newForm) rowCount() int {
	n := 0
	for x := fieldAgent; x < fieldCount; x++ {
		if f.visible(x) {
			n++
		}
	}
	return n
}

func (f *newForm) boxHeight() int {
	return max(f.height-f.rowCount(), f.st.frame.GetVerticalFrameSize()+1)
}

// update has no modes: in a text field every key types; on a choice field
// j/k move and h/l change the value.
func (f *newForm) update(msg tea.Msg) (tea.Cmd, formAction) {
	rows := f.rowCount()
	cmd, action := f.handle(msg)
	if f.rowCount() != rows {
		f.resize(f.width, f.height)
	}
	return cmd, action
}

func (f *newForm) handle(msg tea.Msg) (tea.Cmd, formAction) {
	keyMsg, ok := msg.(tea.KeyPressMsg)
	if !ok {
		return f.updateFocused(msg), formNone
	}
	switch keyMsg.String() {
	case "enter":
		return nil, formSubmit
	case "esc":
		return nil, formBack
	case "tab":
		if f.canComplete() {
			return f.updateFocused(msg), formNone
		}
		return f.move(1), formNone
	case "shift+tab":
		return f.move(-1), formNone
	}
	if f.isText() {
		return f.updateFocused(msg), formNone
	}
	switch keyMsg.String() {
	case "j", "down":
		return f.move(1), formNone
	case "k", "up":
		return f.move(-1), formNone
	case "h", "left":
		f.cycle(-1)
	case "l", "right", "space":
		f.cycle(1)
	}
	return nil, formNone
}

func (f *newForm) draft() Draft {
	d := Draft{
		Selection: f.selections[f.agent],
		Prompt:    f.prompt.Value(),
		Branch:    strings.TrimSpace(f.branch.Value()),
		Repo:      f.repo.Root,
	}
	if base := strings.TrimSpace(f.base.Value()); base != f.repo.Base {
		d.Base = base
	}
	return d
}

// saveOrClear keeps a draft with a prompt and removes an empty one.
func (f *newForm) saveOrClear() error {
	if !f.hasDraft() {
		clearDraft()
		return nil
	}
	return saveDraft(f.draft())
}

// spec checks the form and gives the job.
func (f *newForm) spec() (JobSpec, error) {
	switch {
	case !f.hasDraft():
		return JobSpec{}, fmt.Errorf("The prompt is empty.")
	case strings.TrimSpace(f.base.Value()) == "":
		return JobSpec{}, fmt.Errorf("The base is empty.")
	}
	return JobSpec{
		Selection: f.selections[f.agent],
		Repo:      f.repo.Root,
		RepoName:  f.repo.Name,
		Prompt:    f.prompt.Value(),
		Branch:    strings.TrimSpace(f.branch.Value()),
		Base:      strings.TrimSpace(f.base.Value()),
	}, nil
}

func (f *newForm) hint(x field) string {
	switch x {
	case fieldBranch:
		if b := strings.TrimSpace(f.branch.Value()); b != "" && f.names.has(b) && !f.canComplete() {
			return f.st.yellow.Render("exists")
		}
	case fieldBase:
		if b := strings.TrimSpace(f.base.Value()); b != "" && !f.names.has(b) && !f.canComplete() {
			return f.st.err.Render("unknown branch")
		}
	}
	return ""
}

func (f *newForm) view() string {
	st := f.st
	var rows []string
	for x := fieldAgent; x < fieldCount; x++ {
		if !f.visible(x) {
			continue
		}
		label, mark := st.dim.Render(fmt.Sprintf("%-7s", fieldLabels[x])), "  "
		if f.focus == x {
			label, mark = st.focus.Render(fmt.Sprintf("%-7s", fieldLabels[x])), st.focus.Render("▸ ")
		}
		var value string
		switch x {
		case fieldAgent:
			value = f.selector(x, f.agent)
		case fieldModel:
			value = f.selector(x, f.selections[f.agent].Model)
		case fieldEffort:
			value = f.selector(x, f.selections[f.agent].Effort)
		case fieldBranch:
			value = f.branch.View()
		case fieldBase:
			value = f.base.View()
		}
		line := mark + label + " " + value
		if hint := f.hint(x); hint != "" {
			line += "  " + hint
		}
		rows = append(rows, line)
	}
	border := st.surface1
	if f.focus == fieldPrompt {
		border = st.accent
	}
	return f.box(f.prompt.View(), border) + "\n" + strings.Join(rows, "\n")
}

// box draws the rounded frame around the prompt, padded to the full box.
// lipgloss would measure every cell of the box on each key press.
func (f *newForm) box(content string, border color.Color) string {
	bs := lipgloss.NewStyle().Foreground(border)
	b := lipgloss.RoundedBorder()
	innerW := max(f.width-4, 1)
	left, right := bs.Render(b.Left)+" ", " "+bs.Render(b.Right)
	lines := strings.Split(content, "\n")
	out := []string{bs.Render(b.TopLeft + strings.Repeat(b.Top, innerW+2) + b.TopRight)}
	for i := range f.boxHeight() - 2 {
		l := ""
		if i < len(lines) {
			l = ansi.Truncate(lines[i], innerW, "")
		}
		out = append(out, left+l+strings.Repeat(" ", max(innerW-ansi.StringWidth(l), 0))+right)
	}
	out = append(out, bs.Render(b.BottomLeft+strings.Repeat(b.Bottom, innerW+2)+b.BottomRight))
	return strings.Join(out, "\n")
}

func (f *newForm) selector(x field, value string) string {
	if value == "" {
		value = "default"
	}
	value = "‹ " + value + " ›"
	if f.focus == x {
		return f.st.focus.Render(value)
	}
	return value
}
