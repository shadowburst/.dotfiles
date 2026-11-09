package main

// The popup. The list of worktrees and branches is the home view; n, m and x
// open the New, Merge and Remove views for the selected row. Every view fills
// the popup and has one key line at the bottom.

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"syscall"
	"time"

	"charm.land/bubbles/v2/textinput"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"
)

type view int

const (
	viewList view = iota
	viewNew
	viewMerge
	viewRemove
)

var previewModes = []string{"diff", "log", "changes"}

const previewLines = 500

type styles struct {
	popupStyles
	green, yellow, purple, bold, sel, key lipgloss.Style
}

func newStyles(p palette) styles {
	ps := newPopupStyles(p)
	return styles{
		popupStyles: ps,
		green:       lipgloss.NewStyle().Foreground(lipgloss.Color("2")),
		yellow:      lipgloss.NewStyle().Foreground(lipgloss.Color("3")),
		purple:      lipgloss.NewStyle().Foreground(lipgloss.Color("5")),
		bold:        lipgloss.NewStyle().Bold(true).Foreground(ps.text),
		sel:         lipgloss.NewStyle().Background(themeColor(p.Surface0)),
		key:         lipgloss.NewStyle().Foreground(ps.accent),
	}
}

// help renders "key action" pairs.
func (st styles) help(pairs ...string) string {
	var parts []string
	for i := 0; i+1 < len(pairs); i += 2 {
		parts = append(parts, st.key.Render(pairs[i])+" "+st.dim.Render(pairs[i+1]))
	}
	return strings.Join(parts, "  ")
}

// ops are the side effects of the popup, so that the tests can replace them.
type ops struct {
	launch func(JobSpec) error
	open   func(r row) error
	// finish runs after a merge or a removal: it can focus the main checkout,
	// then it closes the Spaces of the row.
	finish func(r, main row, focusMain bool) error
	run    func(dir string, args ...string) *stream
	reload func(repo string) tea.Msg
}

type uiModel struct {
	st          styles
	repo        repoInfo
	hasRepo     bool
	cwd         string
	focusedPath string
	def         string
	rows        []row
	ops         ops

	filter    textinput.Model
	filtering bool
	cursor    int
	preview   int
	scroll    int
	previews  map[string]string

	view   view
	form   newForm
	target textinput.Model
	sel    row
	out    []string
	stream *stream
	failed bool

	message string
	ok      bool
	width   int
	height  int
}

type previewMsg struct{ key, text string }
type prMsg map[string]int
type lineMsg string
type doneMsg struct{ err error }
type rowsMsg struct {
	def  string
	rows []row
	err  error
}

func newUIModel(cfg Config, st styles, repo repoInfo, hasRepo bool, names branchSet, o ops) uiModel {
	m := uiModel{
		st: st, repo: repo, hasRepo: hasRepo, ops: o, previews: map[string]string{},
		width: 100, height: 30,
	}
	m.filter = branchInput(st, branchSet{})
	m.filter.ShowSuggestions = false
	m.form = newNewForm(cfg, st, repo, names)
	m.form.resize(m.contentWidth(), m.bodyHeight())
	return m
}

// setRows keeps the selected row when it is still in the list.
func (m *uiModel) setRows(def string, rows []row) {
	current, ok := m.current()
	m.def, m.rows = def, rows
	m.cursor = 0
	path := m.focusedPath
	if ok {
		path = current.Path
	}
	for i, idx := range m.visible() {
		r := m.rows[idx]
		if (ok && r.Branch == current.Branch && r.Remote == current.Remote) || (!ok && path != "" && r.Path == path) {
			m.cursor = i
			break
		}
	}
}

func (m uiModel) Init() tea.Cmd {
	if !m.hasRepo {
		return nil
	}
	return tea.Batch(m.previewCmd(), loadPRs(m.repo.Root))
}

// visible lists the rows that match the filter. Remote branches only show with
// a filter, so the list stays short.
func (m uiModel) visible() []int {
	q := strings.TrimSpace(m.filter.Value())
	var out []int
	for i, r := range m.rows {
		if r.Remote != "" && q == "" {
			continue
		}
		if q == "" || fuzzy(r.name(), q) {
			out = append(out, i)
		}
	}
	return out
}

// fuzzy is a subsequence match.
func fuzzy(s, q string) bool {
	s, q = strings.ToLower(s), strings.ToLower(q)
	i := 0
	for _, r := range s {
		if i < len(q) && rune(q[i]) == r {
			i++
		}
	}
	return i == len(q)
}

func (m uiModel) current() (row, bool) {
	v := m.visible()
	if len(v) == 0 {
		return row{}, false
	}
	return m.rows[v[min(m.cursor, len(v)-1)]], true
}

func (m uiModel) mainRow() row {
	for _, r := range m.rows {
		if r.Main {
			return r
		}
	}
	return row{Path: m.repo.Root, Main: true}
}

func (m *uiModel) moveBy(d int) tea.Cmd {
	n := len(m.visible())
	m.cursor = min(max(m.cursor+d, 0), max(n-1, 0))
	m.scroll = 0
	return m.previewCmd()
}

func (m uiModel) previewKey(r row) string {
	return fmt.Sprintf("%d|%s|%s|%s", m.preview, r.Path, r.Remote, r.Branch)
}

func (m uiModel) previewCmd() tea.Cmd {
	r, ok := m.current()
	if !ok {
		return nil
	}
	key := m.previewKey(r)
	if _, ok := m.previews[key]; ok {
		return nil
	}
	repo, def, mode := m.repo.Root, m.def, m.preview
	return func() tea.Msg { return previewMsg{key, loadPreview(repo, def, r, mode)} }
}

func loadPRs(repo string) tea.Cmd {
	return func() tea.Msg {
		_, rows, err := loadRows(repo, true)
		if err != nil {
			return nil
		}
		prs := prMsg{}
		for _, r := range rows {
			if r.PR != 0 && r.Remote == "" {
				prs[r.Branch] = r.PR
			}
		}
		return prs
	}
}

func git(dir string, args ...string) string {
	out, _ := output(defaultTimeout, dir, "git", args...)
	return out
}

func loadPreview(repo, def string, r row, mode int) string {
	dir, ref := r.gitRef(repo)
	var out string
	switch previewModes[mode] {
	case "diff":
		if def != "" && ref != def {
			out = git(dir, "diff", "--color=always", "--stat", "--patch", def+"..."+ref)
		}
	case "log":
		rng := ref
		if def != "" && ref != def {
			rng = def + ".." + ref
		}
		out = git(dir, "log", "--color=always", "--oneline", "--decorate", "-n", "200", rng)
	case "changes":
		if r.Path != "" {
			out = git(r.Path, "-c", "color.status=always", "status", "--short") +
				git(r.Path, "diff", "--color=always", "HEAD")
		}
	}
	lines := strings.Split(strings.ReplaceAll(strings.TrimRight(out, "\n"), "\t", "    "), "\n")
	return strings.Join(lines[:min(len(lines), previewLines)], "\n")
}

func (m uiModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width, m.height = msg.Width, msg.Height
		m.form.resize(m.contentWidth(), m.bodyHeight())
		return m, nil
	case previewMsg:
		m.previews[msg.key] = msg.text
		return m, nil
	case prMsg:
		for i, r := range m.rows {
			if n, ok := msg[r.Branch]; ok && r.Remote == "" {
				m.rows[i].PR = n
			}
		}
		return m, nil
	case rowsMsg:
		if msg.err != nil {
			m.message, m.ok = msg.err.Error(), false
		} else {
			m.setRows(msg.def, msg.rows)
		}
		return m, m.previewCmd()
	case lineMsg:
		m.out = append(m.out, string(msg))
		return m, m.stream.next()
	case doneMsg:
		return m.finished(msg.err)
	case tea.KeyPressMsg:
		if msg.String() == "ctrl+c" {
			if m.view == viewNew {
				_ = m.form.saveOrClear()
			}
			return m, tea.Quit
		}
		m.message = ""
	}
	switch m.view {
	case viewNew:
		return m.updateNew(msg)
	case viewMerge, viewRemove:
		return m.updateAction(msg)
	}
	return m.updateList(msg)
}

func (m uiModel) updateList(msg tea.Msg) (tea.Model, tea.Cmd) {
	k, ok := msg.(tea.KeyPressMsg)
	if !ok {
		return m, nil
	}
	if !m.hasRepo {
		if k.String() == "esc" || k.String() == "q" {
			return m, tea.Quit
		}
		return m, nil
	}
	if m.filtering {
		switch k.String() {
		case "esc":
			m.filtering = false
			m.filter.SetValue("")
			m.filter.Blur()
			return m, m.moveBy(0)
		case "enter":
			m.filtering = false
			m.filter.Blur()
			return m, nil
		case "down", "ctrl+j", "ctrl+n":
			return m, m.moveBy(1)
		case "up", "ctrl+k", "ctrl+p":
			return m, m.moveBy(-1)
		}
		old := m.filter.Value()
		var cmd tea.Cmd
		m.filter, cmd = m.filter.Update(msg)
		if m.filter.Value() != old {
			m.cursor = 0
		}
		return m, tea.Batch(cmd, m.moveBy(0))
	}
	switch k.String() {
	case "j", "down":
		return m, m.moveBy(1)
	case "k", "up":
		return m, m.moveBy(-1)
	case "g", "home":
		return m, m.moveBy(-len(m.rows))
	case "G", "end":
		return m, m.moveBy(len(m.rows))
	case "ctrl+d":
		m.scroll += 10
	case "ctrl+u":
		m.scroll = max(m.scroll-10, 0)
	case "p", "tab":
		m.preview = (m.preview + 1) % len(previewModes)
		m.scroll = 0
		return m, m.previewCmd()
	case "/":
		m.filtering = true
		return m, m.filter.Focus()
	case "enter":
		return m.open()
	case "n":
		return m.openNew()
	case "m":
		return m.openAction(viewMerge)
	case "x", "d":
		return m.openAction(viewRemove)
	case "q":
		return m, tea.Quit
	case "esc":
		if m.filter.Value() != "" {
			m.filter.SetValue("")
			return m, m.moveBy(0)
		}
		return m, tea.Quit
	}
	return m, nil
}

func (m uiModel) open() (tea.Model, tea.Cmd) {
	r, ok := m.current()
	if !ok {
		return m, nil
	}
	var err error
	if r.Path != "" {
		err = m.ops.open(r)
	} else {
		err = m.ops.launch(JobSpec{Repo: m.repo.Root, RepoName: m.repo.Name, Branch: r.Branch, Base: m.def, Focus: true})
	}
	if err != nil {
		m.message, m.ok = err.Error(), false
		return m, nil
	}
	return m, tea.Quit
}

// openNew uses the selected branch as the base, unless a draft has its own.
func (m uiModel) openNew() (tea.Model, tea.Cmd) {
	if r, ok := m.current(); ok && r.Branch != "" && !m.form.hasDraft() {
		m.form.base.SetValue(r.Branch)
	}
	m.view = viewNew
	return m, m.form.setFocus(fieldPrompt)
}

func (m uiModel) updateNew(msg tea.Msg) (tea.Model, tea.Cmd) {
	cmd, action := m.form.update(msg)
	switch action {
	case formSubmit:
		spec, err := m.form.spec()
		if err == nil {
			err = m.ops.launch(spec)
		}
		if err != nil {
			m.message, m.ok = err.Error(), false
			return m, nil
		}
		return m, tea.Quit
	case formBack:
		if err := m.form.saveOrClear(); err != nil {
			m.message, m.ok = "Cannot save the draft: "+err.Error(), false
			return m, nil
		}
		m.view = viewList
		m.form.setFocus(fieldPrompt)
		m.form.prompt.Blur()
	}
	return m, cmd
}

// refusal tells why the row cannot be merged or removed.
func refusal(r row, v view) string {
	switch {
	case r.Main:
		return "This is the main checkout."
	case r.Remote != "":
		return "This branch is only on " + r.Remote + "."
	case v == viewMerge && r.Path == "":
		return "This branch has no worktree."
	case r.Branch == "":
		return "This worktree has no branch."
	case r.Busy:
		return "An agent is working here."
	case v == viewRemove && r.Dirty:
		return "Uncommitted changes. Commit or stash them first."
	}
	return ""
}

func (m uiModel) openAction(v view) (tea.Model, tea.Cmd) {
	r, ok := m.current()
	if !ok {
		return m, nil
	}
	m.view, m.sel, m.out, m.stream, m.failed = v, r, nil, nil, false
	if v != viewMerge || refusal(r, v) != "" {
		return m, nil
	}
	target := mergeBase(m.repo.Root, r.Branch)
	if target == "" {
		target = m.def
	}
	m.target = branchInput(m.st, m.form.names)
	m.target.SetValue(target)
	return m, m.target.Focus()
}

func (m uiModel) running() bool { return m.stream != nil && !m.failed }

func (m uiModel) updateAction(msg tea.Msg) (tea.Model, tea.Cmd) {
	k, ok := msg.(tea.KeyPressMsg)
	if !ok {
		return m, nil
	}
	s := k.String()
	switch {
	case m.failed && (s == "enter" || s == "esc"):
		return m.backToList()
	case m.running():
		return m, nil
	case s == "esc" || (m.view == viewRemove && s == "n"):
		return m.backToList()
	case refusal(m.sel, m.view) != "":
		return m, nil
	case m.view == viewRemove && s == "y":
		args := []string{"-C", m.repo.Root, "remove", m.sel.Branch, "--yes", "--foreground"}
		if m.sel.forceDelete() {
			args = append(args, "--force-delete")
		}
		m.stream = m.ops.run(m.repo.Root, args...)
		return m, m.stream.next()
	case m.view == viewMerge && s == "enter":
		target := strings.TrimSpace(m.target.Value())
		if target == "" {
			m.message, m.ok = "The target is empty.", false
			return m, nil
		}
		m.target.Blur()
		m.stream = m.ops.run(m.sel.Path, "-C", m.sel.Path, "merge", target, "--yes")
		return m, m.stream.next()
	case m.view == viewMerge:
		var cmd tea.Cmd
		m.target, cmd = m.target.Update(msg)
		return m, cmd
	}
	return m, nil
}

func (m uiModel) backToList() (tea.Model, tea.Cmd) {
	m.view, m.stream, m.out, m.failed = viewList, nil, nil, false
	repo := m.repo.Root
	return m, func() tea.Msg { return m.ops.reload(repo) }
}

func reloadRows(repo string) tea.Msg {
	def, rows, err := loadRows(repo, false)
	attachHerdr(rows, workspaces(), herdrAgents())
	return rowsMsg{def, rows, err}
}

// finished closes the popup after a merge, and after the removal of the
// focused worktree, because its Space closes. Another removal goes back to the list.
func (m uiModel) finished(err error) (tea.Model, tea.Cmd) {
	if err != nil {
		m.failed = true
		m.message, m.ok = "wt failed: "+err.Error(), false
		return m, nil
	}
	m.stream = nil
	focusMain := m.view == viewMerge || (m.sel.Path != "" && m.sel.Path == m.focusedPath)
	if err := m.ops.finish(m.sel, m.mainRow(), focusMain); err != nil {
		m.failed = true
		m.message, m.ok = err.Error(), false
		return m, nil
	}
	if focusMain {
		return m, tea.Quit
	}
	name := m.sel.Branch
	next, cmd := m.backToList()
	nm := next.(uiModel)
	nm.message, nm.ok = "Removed "+name, true
	return nm, cmd
}

// ---------------------------------------------------------------- view

func (m uiModel) View() tea.View {
	v := tea.NewView(m.render())
	v.AltScreen = true
	return v
}

func (m uiModel) contentWidth() int { return max(m.width-2, 12) }

func (m uiModel) bodyHeight() int { return max(m.height-2, 3) }

func (m uiModel) render() string {
	st, w := m.st, m.contentWidth()
	bodyH := m.bodyHeight()
	var body, help string
	switch {
	case !m.hasRepo:
		body = st.err.Render("Not a Git repository: " + m.cwd)
		help = st.help("esc", "close")
	case m.view == viewNew:
		body = m.form.view()
		help = st.help("⏎", "launch", "⇥", "next", "esc", "back")
	case m.view == viewMerge:
		body, help = m.actionView(w, bodyH), st.help("⏎", "merge", "esc", "back")
	case m.view == viewRemove:
		body, help = m.actionView(w, bodyH), st.help("y", "remove", "esc", "back")
	default:
		body = m.listView(w, bodyH)
		help = st.help("⏎", "open", "n", "new", "m", "merge", "x", "remove", "/", "filter", "p", "preview")
		if m.filtering {
			help = st.help("⏎", "keep", "esc", "clear")
		}
	}
	if m.view == viewMerge || m.view == viewRemove {
		switch {
		case m.failed:
			help = st.help("⏎", "back")
		case m.running():
			help = ""
		case refusal(m.sel, m.view) != "":
			help = st.help("esc", "back")
		}
	}
	message := st.err.Render(m.message)
	if m.ok {
		message = st.green.Render(m.message)
	}
	content := fit(body, w, bodyH) + "\n" + fit(message, w, 1) + "\n" + clip(help, w)
	// A left margin of one cell. lipgloss Padding would measure every cell
	// again, and View runs on each key press.
	return " " + strings.ReplaceAll(content, "\n", "\n ")
}

func (m uiModel) listView(w, h int) string {
	st := m.st
	if m.filtering || m.filter.Value() != "" {
		return st.key.Render("/") + m.filter.View() + "\n" + m.panes(w, h-1)
	}
	return m.panes(w, h)
}

// panes puts the list and the preview side by side when the popup is wide.
func (m uiModel) panes(w, h int) string {
	if w >= 110 {
		lw := min(w*55/100, 90)
		left := fit(m.rowsView(lw, h), lw, h)
		sep := strings.TrimSuffix(strings.Repeat(m.st.dim.Render("│")+"\n", h), "\n")
		return lipgloss.JoinHorizontal(lipgloss.Top, left, sep, " ", m.previewView(w-lw-2, h))
	}
	lh := min(max(len(m.visible()), 1), max(h/2, 3))
	return fit(m.rowsView(w, lh), w, lh) + "\n" + m.st.dim.Render(strings.Repeat("─", w)) + "\n" +
		m.previewView(w, max(h-lh-1, 1))
}

func (m uiModel) rowsView(w, h int) string {
	v := m.visible()
	if len(v) == 0 {
		return ""
	}
	nameW := 0
	for _, i := range v {
		nameW = max(nameW, lipgloss.Width(m.rows[i].name()))
	}
	nameW = min(nameW+2, 44)
	start := max(m.cursor-h+1, 0)
	var lines []string
	for i := start; i < len(v) && len(lines) < h; i++ {
		lines = append(lines, m.rowLine(m.rows[v[i]], w, nameW, i == m.cursor))
	}
	return strings.Join(lines, "\n")
}

func (st styles) kindIcon(r row) string {
	switch {
	case r.Main:
		return st.key.Render("⌂")
	case r.Remote != "":
		return st.dim.Render("☁")
	case r.Path == "":
		return st.dim.Render("⎇")
	}
	return st.key.Render("◆")
}

func (st styles) syncText(r row) string {
	s := ""
	if r.Ahead > 0 {
		s += st.green.Render(fmt.Sprintf("↑%d", r.Ahead))
	}
	if r.Behind > 0 {
		s += st.err.Render(fmt.Sprintf("↓%d", r.Behind))
	}
	if r.Dirty {
		s += st.yellow.Render(" ✎")
	}
	return s
}

func (st styles) prText(r row) string {
	if r.PR == 0 {
		return ""
	}
	return st.green.Render(fmt.Sprintf("#%d", r.PR))
}

func (st styles) agentText(r row) string {
	switch {
	case r.Agent == "":
		return ""
	case r.Busy:
		return st.yellow.Render("◉ " + r.Agent)
	}
	return st.dim.Render("○ " + r.Agent)
}

func (m uiModel) rowLine(r row, w, nameW int, selected bool) string {
	st := m.st
	mark, name := "  ", lipgloss.NewStyle().Foreground(st.text).Render(r.name())
	switch {
	case selected:
		mark, name = st.focus.Render("▌ "), st.bold.Render(r.name())
	case r.Path == "":
		name = st.dim.Render(r.name())
	}
	line := mark + st.kindIcon(r) + " " + padRight(name, nameW) + padRight(st.syncText(r), 12) +
		padRight(st.prText(r), 7) + st.agentText(r)
	line = clip(line, w)
	if selected {
		return st.sel.Render(padRight(line, w))
	}
	return line
}

func (m uiModel) previewView(w, h int) string {
	st := m.st
	var tabs []string
	for i, mode := range previewModes {
		if i == m.preview {
			tabs = append(tabs, st.focus.Render(mode))
		} else {
			tabs = append(tabs, st.dim.Render(mode))
		}
	}
	head := strings.Join(tabs, st.dim.Render(" │ "))
	r, ok := m.current()
	if !ok {
		return fit(head, w, h)
	}
	body := strings.Split(m.previews[m.previewKey(r)], "\n")
	body = body[min(m.scroll, len(body)):]
	return fit(head+"\n"+strings.Join(body, "\n"), w, h)
}

func (m uiModel) card(r row) string {
	st := m.st
	parts := []string{st.kindIcon(r) + " " + st.bold.Render(r.name())}
	for _, s := range []string{st.syncText(r), st.prText(r), st.agentText(r)} {
		if s != "" {
			parts = append(parts, s)
		}
	}
	return strings.Join(parts, "  ")
}

func (m uiModel) actionView(w, h int) string {
	st := m.st
	lines := []string{m.card(m.sel), ""}
	if r := refusal(m.sel, m.view); r != "" {
		return strings.Join(append(lines, st.err.Render(r)), "\n")
	}
	if m.view == viewMerge {
		label := st.dim.Render("into ")
		if m.target.Focused() {
			label = st.focus.Render("into ")
		}
		m.target.SetWidth(max(w-6, 4))
		lines = append(lines, label+m.target.View())
	} else if m.sel.forceDelete() {
		lines = append(lines, st.err.Render("Unmerged commits will be lost."))
	}
	if len(m.out) > 0 {
		lines = append(lines, "")
		room := max(h-len(lines), 1)
		for _, l := range m.out[max(len(m.out)-room, 0):] {
			lines = append(lines, clip(l, w))
		}
	}
	return strings.Join(lines, "\n")
}

// fit pads or cuts s to exactly w x h cells.
func fit(s string, w, h int) string {
	lines := strings.Split(s, "\n")
	if len(lines) > h {
		lines = lines[:max(h, 0)]
	}
	for len(lines) < h {
		lines = append(lines, "")
	}
	for i, l := range lines {
		l = clip(l, w)
		lines[i] = l + strings.Repeat(" ", max(w-lipgloss.Width(l), 0))
	}
	return strings.Join(lines, "\n")
}

// clip cuts each line of s to w cells.
func clip(s string, w int) string {
	lines := strings.Split(s, "\n")
	for i, l := range lines {
		lines[i] = ansi.Truncate(l, max(w, 1), "")
	}
	return strings.Join(lines, "\n")
}

func padRight(s string, w int) string { return s + strings.Repeat(" ", max(w-lipgloss.Width(s), 0)) }

// ---------------------------------------------------------------- side effects

// stream runs a command and gives its output line by line.
type stream struct {
	lines chan string
	err   chan error
}

func startStream(dir, name string, args ...string) *stream {
	s := &stream{lines: make(chan string, 64), err: make(chan error, 1)}
	go func() {
		pr, pw := io.Pipe()
		cmd := exec.Command(name, args...)
		cmd.Dir = dir
		cmd.Stdout, cmd.Stderr = pw, pw
		if err := cmd.Start(); err != nil {
			close(s.lines)
			s.err <- err
			return
		}
		go func() {
			err := cmd.Wait()
			_ = pw.Close()
			s.err <- err
		}()
		sc := bufio.NewScanner(pr)
		sc.Buffer(make([]byte, 64*1024), 1024*1024)
		for sc.Scan() {
			s.lines <- sc.Text()
		}
		close(s.lines)
	}()
	return s
}

func (s *stream) next() tea.Cmd {
	return func() tea.Msg {
		if line, ok := <-s.lines; ok {
			return lineMsg(line)
		}
		return doneMsg{<-s.err}
	}
}

func runWt(dir string, args ...string) *stream { return startStream(dir, wtBin(), args...) }

// openRow focuses the Space of a checkout of repo, or opens one.
func openRow(repo string, r row) error {
	if len(r.Workspaces) > 0 {
		_, err := herdrCall(defaultTimeout, nil, "workspace", "focus", r.Workspaces[0])
		return err
	}
	err := openWorktree(repo, r.Path, "", true, nil)
	if err != nil && r.Main {
		_, err = herdrCall(defaultTimeout, nil, "workspace", "create", "--cwd", r.Path, "--focus")
	}
	return err
}

func finishRow(r, main row, focusMain bool) error {
	if focusMain {
		if err := openRow(main.Path, main); err != nil {
			return err
		}
	}
	for _, id := range r.Workspaces {
		if _, err := herdrCall(defaultTimeout, nil, "workspace", "close", id); err != nil {
			return err
		}
	}
	return nil
}

// startJob writes the spec and starts the job in a new session, so that the job
// survives the end of the popup. Herdr sends a hangup when the popup closes.
func startJob(spec JobSpec) error {
	if spec.Prompt != "" {
		if err := savePrefs(spec.Selection); err != nil {
			return err
		}
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
	if spec.Prompt != "" {
		clearDraft()
	}
	return cmd.Process.Release()
}

func runPopup() error {
	cwds := contextCwds(os.Getenv("HERDR_PLUGIN_CONTEXT_JSON"))
	st := newStyles(loadPalette())
	var repo repoInfo
	hasRepo := false
	for _, cwd := range cwds {
		if repo, hasRepo = detectRepo(cwd); hasRepo {
			break
		}
	}
	var names branchSet
	if hasRepo {
		names = loadBranches(repo.Root)
	}
	m := newUIModel(loadConfig(), st, repo, hasRepo, names, ops{launch: startJob, open: func(r row) error { return openRow(repo.Root, r) }, finish: finishRow, run: runWt, reload: reloadRows})
	if len(cwds) > 0 {
		m.cwd = cwds[0]
	}
	if hasRepo {
		m.focusedPath = focusedCheckout(cwds)
		def, rows, err := loadRows(repo.Root, false)
		if err != nil {
			m.message = err.Error()
		}
		attachHerdr(rows, workspaces(), herdrAgents())
		m.setRows(def, rows)
	}
	_, err := tea.NewProgram(m).Run()
	return err
}
