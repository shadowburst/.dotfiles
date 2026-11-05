package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"syscall"
	"time"

	"charm.land/bubbles/v2/key"
	"charm.land/bubbles/v2/textarea"
	"charm.land/bubbles/v2/textinput"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
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

// repoInfo is the repository of the focused workspace.
type repoInfo struct {
	Root string // the main checkout
	Name string
	Base string // the branch of the focused workspace
}

// pluginContext is the part of HERDR_PLUGIN_CONTEXT_JSON that the popup reads.
type pluginContext struct {
	WorkspaceCwd   string        `json:"workspace_cwd"`
	FocusedPaneCwd string        `json:"focused_pane_cwd"`
	Worktree       *worktreeInfo `json:"worktree"`
}

// contextCwds lists the caller's directories, the most specific first. A pane
// that a plugin opens has the plugin directory as its cwd, so it cannot use its own.
func contextCwds(raw string) []string {
	var ctx pluginContext
	if json.Unmarshal([]byte(raw), &ctx) != nil {
		return nil
	}
	var cwds []string
	if ctx.Worktree != nil && ctx.Worktree.CheckoutPath != "" {
		cwds = append(cwds, ctx.Worktree.CheckoutPath)
	}
	for _, cwd := range []string{ctx.WorkspaceCwd, ctx.FocusedPaneCwd} {
		if cwd != "" && !slices.Contains(cwds, cwd) {
			cwds = append(cwds, cwd)
		}
	}
	return cwds
}

func detectRepo(cwd string) (repoInfo, bool) {
	out, ok := output(defaultTimeout, cwd, "git", "rev-parse", "--path-format=absolute", "--git-common-dir")
	if !ok {
		return repoInfo{}, false
	}
	root := filepath.Dir(strings.TrimSpace(out))
	base, _ := output(defaultTimeout, cwd, "git", "branch", "--show-current")
	base = strings.TrimSpace(base)
	if base == "" { // detached HEAD
		sha, _ := output(defaultTimeout, cwd, "git", "rev-parse", "--short", "HEAD")
		base = strings.TrimSpace(sha)
	}
	return repoInfo{Root: root, Name: filepath.Base(root), Base: base}, true
}

type popupModel struct {
	cfg     Config
	repo    repoInfo
	hasRepo bool
	cwd     string
	styles  popupStyles

	prompt textarea.Model
	branch textinput.Model
	base   textinput.Model

	agent      string
	selections map[string]Selection

	focus       field
	showOptions bool
	message     string
	width       int
	height      int

	launch func(JobSpec) error
}

func newPopupModel(cfg Config, cwds []string, launch func(JobSpec) error) popupModel {
	st := newPopupStyles(loadPalette())
	ta := textarea.New()
	ta.ShowLineNumbers = false
	ta.CharLimit = 0
	ta.MaxHeight = 0
	ta.MaxWidth = 0
	ta.Prompt = ""
	ta.Placeholder = "Describe the task"
	taStyles := ta.Styles()
	taStyles.Cursor.Color = st.accent
	for _, state := range []*textarea.StyleState{&taStyles.Focused, &taStyles.Blurred} {
		state.CursorLine = lipgloss.NewStyle()
		state.Text = lipgloss.NewStyle().Foreground(st.text)
		state.Placeholder = st.dim
	}
	ta.SetStyles(taStyles)
	ta.KeyMap.InsertNewline = key.NewBinding(key.WithKeys("shift+enter", "alt+enter", "ctrl+j"))
	ta.Focus()

	m := popupModel{
		cfg: cfg, styles: st, prompt: ta, launch: launch,
		branch: newInput("auto", st), base: newInput("", st),
		selections: map[string]Selection{}, width: 60, height: 14,
	}
	if len(cwds) > 0 {
		m.cwd = cwds[0]
	}
	for _, cwd := range cwds {
		if repo, ok := detectRepo(cwd); ok {
			m.repo, m.hasRepo = repo, true
			break
		}
	}

	p := loadPrefs()
	m.agent = agentKinds[0]
	if slices.Contains(agentKinds, p.Agent) {
		m.agent = p.Agent
	}
	for _, kind := range agentKinds {
		m.selections[kind] = m.validSelection(p.Agents[kind], kind)
	}
	m.base.SetValue(m.repo.Base)

	if d, ok := loadDraft(); ok {
		m.prompt.SetValue(d.Prompt)
		m.branch.SetValue(d.Branch)
		if slices.Contains(agentKinds, d.Agent) {
			m.agent = d.Agent
			m.selections[d.Agent] = m.validSelection(d.Selection, d.Agent)
		}
		if d.Base != "" && d.Repo == m.repo.Root {
			m.base.SetValue(d.Base)
		}
	}
	return m
}

func newInput(placeholder string, st popupStyles) textinput.Model {
	in := textinput.New()
	in.Placeholder = placeholder
	in.Prompt = ""
	inStyles := in.Styles()
	inStyles.Cursor.Color = st.accent
	for _, state := range []*textinput.StyleState{&inStyles.Focused, &inStyles.Blurred} {
		state.Text = lipgloss.NewStyle().Foreground(st.text)
		state.Placeholder = st.dim
	}
	in.SetStyles(inStyles)
	return in
}

// validSelection replaces values that the config no longer lists.
func (m popupModel) validSelection(s Selection, kind string) Selection {
	s.Agent = kind
	s.Model = validChoice(s.Model, m.cfg.Agents[kind].Models)
	s.Effort = validChoice(s.Effort, m.cfg.Agents[kind].Efforts)
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

func (m popupModel) Init() tea.Cmd { return textarea.Blink }

// fieldVisible hides the fields that the selected agent cannot use.
func (m popupModel) fieldVisible(f field) bool {
	if f == fieldModel || f == fieldEffort {
		return agentHasModel(m.agent)
	}
	return true
}

func (m *popupModel) moveFocus(step int) {
	next := m.focus
	for {
		next = (next + field(step) + fieldCount) % fieldCount
		if m.fieldVisible(next) {
			break
		}
	}
	m.setFocus(next)
}

func (m *popupModel) setFocus(f field) {
	m.focus = f
	m.prompt.Blur()
	m.branch.Blur()
	m.base.Blur()
	switch f {
	case fieldPrompt:
		m.prompt.Focus()
	case fieldBranch:
		m.branch.Focus()
	case fieldBase:
		m.base.Focus()
	}
}

func cycle(value string, choices []string, step int) string {
	if len(choices) == 0 {
		return value
	}
	i := slices.Index(choices, value)
	return choices[(i+step+len(choices))%len(choices)]
}

func (m *popupModel) cycleField(step int) {
	sel := m.selections[m.agent]
	options := m.cfg.Agents[m.agent]
	switch m.focus {
	case fieldAgent:
		m.agent = cycle(m.agent, agentKinds, step)
	case fieldModel:
		sel.Model = cycle(sel.Model, options.Models, step)
	case fieldEffort:
		sel.Effort = cycle(sel.Effort, options.Efforts, step)
	}
	if m.focus != fieldAgent {
		m.selections[m.agent] = sel
	}
}

func (m *popupModel) currentDraft() Draft {
	d := Draft{
		Selection: m.selections[m.agent],
		Prompt:    m.prompt.Value(),
		Branch:    strings.TrimSpace(m.branch.Value()),
		Repo:      m.repo.Root,
	}
	if base := strings.TrimSpace(m.base.Value()); base != m.repo.Base {
		d.Base = base
	}
	return d
}

func (m popupModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width, m.height = msg.Width, msg.Height
		m.layout()
		return m, nil
	case tea.KeyPressMsg:
		m.message = ""
		switch msg.String() {
		case "esc", "ctrl+c":
			return m.close()
		case "enter":
			return m.submit()
		case "ctrl+o":
			m.showOptions = !m.showOptions
			if !m.showOptions {
				m.setFocus(fieldPrompt)
			}
			m.layout()
			return m, nil
		case "tab", "shift+tab":
			if m.showOptions {
				if msg.String() == "tab" {
					m.moveFocus(1)
				} else {
					m.moveFocus(-1)
				}
			}
			return m, nil
		case "left", "right":
			if m.focus >= fieldAgent && m.focus <= fieldEffort {
				if msg.String() == "right" {
					m.cycleField(1)
				} else {
					m.cycleField(-1)
				}
				m.layout()
				return m, nil
			}
		}
	}
	return m.updateFocused(msg)
}

func (m popupModel) updateFocused(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd
	switch m.focus {
	case fieldPrompt:
		m.prompt, cmd = m.prompt.Update(msg)
	case fieldBranch:
		m.branch, cmd = m.branch.Update(msg)
	case fieldBase:
		m.base, cmd = m.base.Update(msg)
	}
	return m, cmd
}

func (m popupModel) close() (tea.Model, tea.Cmd) {
	d := m.currentDraft()
	if strings.TrimSpace(d.Prompt) == "" {
		clearDraft()
	} else if err := saveDraft(d); err != nil {
		m.message = "Cannot save the draft: " + err.Error()
		return m, nil
	}
	return m, tea.Quit
}

func (m popupModel) submit() (tea.Model, tea.Cmd) {
	switch {
	case !m.hasRepo:
		m.message = "Not a Git repository. Press esc."
		return m, nil
	case strings.TrimSpace(m.prompt.Value()) == "":
		m.message = "The prompt is empty."
		return m, nil
	case strings.TrimSpace(m.base.Value()) == "":
		m.message = "The base is empty."
		return m, nil
	}
	spec := JobSpec{
		Selection: m.selections[m.agent],
		Repo:      m.repo.Root,
		RepoName:  m.repo.Name,
		Prompt:    m.prompt.Value(),
		Branch:    strings.TrimSpace(m.branch.Value()),
		Base:      strings.TrimSpace(m.base.Value()),
	}
	if err := m.launch(spec); err != nil {
		m.message = "Cannot start the job: " + err.Error()
		return m, nil
	}
	return m, tea.Quit
}

// Herdr draws the popup border, so the popup's content is the card. The height
// is fixed, so the prompt frame takes the rows that the other parts do not use.
func (m *popupModel) layout() {
	reserved := 7 // title, prompt frame, message, selections, blank, help
	if m.showOptions {
		reserved = 6 + m.visibleOptionCount()
	}
	m.prompt.SetWidth(max(m.contentWidth()-m.styles.frame.GetHorizontalFrameSize(), 10))
	m.prompt.SetHeight(max(m.height-reserved, 1))
	m.branch.SetWidth(max(m.contentWidth()-10, 4))
	m.base.SetWidth(max(m.contentWidth()-10, 4))
}

func (m popupModel) contentWidth() int { return max(m.width-2, 12) }

func (m popupModel) visibleOptionCount() int {
	count := 0
	for f := fieldAgent; f < fieldCount; f++ {
		if m.fieldVisible(f) {
			count++
		}
	}
	return count
}

// chipValues are the selections under the prompt when the options are closed.
func (m popupModel) chipValues() []string {
	sel := m.selections[m.agent]
	values := []string{m.agent}
	if sel.Model != "" {
		values = append(values, sel.Model)
	}
	if sel.Effort != "" {
		values = append(values, sel.Effort)
	}
	if branch := strings.TrimSpace(m.branch.Value()); branch != "" {
		values = append(values, branch)
	}
	if base := strings.TrimSpace(m.base.Value()); base != "" {
		values = append(values, "⎇ "+base)
	}
	return values
}

func (m popupModel) chips() string {
	chips := make([]string, 0, 5)
	for i, value := range m.chipValues() {
		if i == 0 {
			chips = append(chips, m.styles.agent.Render(value))
		} else {
			chips = append(chips, m.styles.chip.Render(value))
		}
	}
	return lipgloss.NewStyle().MaxWidth(m.contentWidth()).Render(strings.Join(chips, " "))
}

func (m popupModel) titleRow() string {
	title, repo := m.styles.title.Render("Prompt"), ""
	if m.hasRepo {
		repo = m.styles.dim.Render(m.repo.Name)
	}
	gap := max(m.contentWidth()-lipgloss.Width(title)-lipgloss.Width(repo), 1)
	return title + strings.Repeat(" ", gap) + repo
}

func (m popupModel) messageRow() string {
	switch {
	case m.message != "":
		return m.styles.err.Render(m.message)
	case !m.hasRepo:
		return m.styles.err.Render("Not a Git repository: " + m.cwd)
	}
	return ""
}

func (m popupModel) optionRow(f field, label, value string) string {
	name := fmt.Sprintf("%-7s", label)
	if m.focus == f {
		name = m.styles.focus.Render(name)
	} else {
		name = m.styles.dim.Render(name)
	}
	return name + " " + value
}

func (m popupModel) selector(value string) string {
	if value == "" {
		value = "default"
	}
	return "‹ " + value + " ›"
}

func (m popupModel) View() tea.View {
	v := tea.NewView(m.render())
	v.AltScreen = true
	return v
}

func (m popupModel) render() string {
	frame := m.styles.surface1
	if m.focus == fieldPrompt {
		frame = m.styles.accent
	}
	rows := []string{
		m.titleRow(),
		m.styles.frame.BorderForeground(frame).Width(m.contentWidth()).Render(m.prompt.View()),
		m.messageRow(),
	}
	help := "⏎ launch   ^O options   esc"
	if m.showOptions {
		sel := m.selections[m.agent]
		rows = append(rows, m.optionRow(fieldAgent, "agent", m.selector(m.agent)))
		if agentHasModel(m.agent) {
			rows = append(rows,
				m.optionRow(fieldModel, "model", m.selector(sel.Model)),
				m.optionRow(fieldEffort, "effort", m.selector(sel.Effort)))
		}
		rows = append(rows,
			m.optionRow(fieldBranch, "branch", m.branch.View()),
			m.optionRow(fieldBase, "base", m.base.View()))
		help = "⏎ launch   ⇥ field   ←/→ change   ^O close   esc"
	} else {
		rows = append(rows, m.chips())
	}
	rows = append(rows, "", m.styles.dim.Render(help))
	return lipgloss.NewStyle().Padding(0, 1).Render(strings.Join(rows, "\n"))
}

// startJob writes the spec and starts the job in a new session, so that the job
// survives the end of the popup. Herdr sends a hangup when the popup closes.
func startJob(spec JobSpec) error {
	if err := savePrefs(spec.Selection); err != nil {
		return err
	}
	id := time.Now().UnixNano()
	specPath := statePath(fmt.Sprintf("jobs/%d.json", id))
	if err := writeJSON(specPath, spec); err != nil {
		return err
	}
	logFile, err := os.OpenFile(statePath(fmt.Sprintf("jobs/%d.log", id)), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return err
	}
	defer logFile.Close()
	self, err := os.Executable()
	if err != nil {
		return err
	}
	cmd := exec.Command(self, "job", specPath)
	cmd.Stdout, cmd.Stderr = logFile, logFile
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	if err := cmd.Start(); err != nil {
		return err
	}
	clearDraft()
	return cmd.Process.Release()
}

func runPopup() error {
	cwds := contextCwds(os.Getenv("HERDR_PLUGIN_CONTEXT_JSON"))
	m := newPopupModel(loadConfig(), cwds, startJob)
	m.layout()
	_, err := tea.NewProgram(m).Run()
	return err
}
