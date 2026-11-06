package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
)

const (
	lerdSetupTimeout   = 20 * time.Minute
	lerdWatcherWait    = 60 * time.Second
	agentBusyWait      = 60 * time.Second
	agentStartTimeout  = 90 * time.Second
	agentEnterAfter    = 8 * time.Second
	agentWorkTimeout   = 25 * time.Second
	agentDialogTimeout = 15 * time.Minute
	lerdNotManaged     = 3
	renameAttempts     = 3
	renameRetryDelay   = time.Second
)

// JobSpec is the work that the popup gives to the detached job.
type JobSpec struct {
	Selection
	Repo     string `json:"repo"`
	RepoName string `json:"repo_name"`
	Prompt   string `json:"prompt"`
	Branch   string `json:"branch,omitempty"`
	Base     string `json:"base"`
}

// stepError names the step that failed, for the notification.
type stepError struct {
	step string
	err  error
}

func (e *stepError) Error() string { return e.step + ": " + e.err.Error() }

func step(name string, err error) error {
	if err == nil {
		return nil
	}
	return &stepError{name, err}
}

func runJob(specPath string) error {
	var spec JobSpec
	if !readJSON(specPath, &spec) {
		return fmt.Errorf("cannot read %s", specPath)
	}
	name, branch, err := launch(spec)
	if err == nil {
		notify("Agent "+name+" has the prompt", branch+" in "+spec.RepoName, "done")
		_ = os.Remove(specPath)
		return nil
	}

	failed := "launch"
	var se *stepError
	if errors.As(err, &se) {
		failed = se.step
	}
	// The draft status comes first: Herdr cuts the body after 240 characters, and
	// the full error stays in the job log.
	var body string
	if draftErr := keepDraft(Draft{
		Selection: spec.Selection, Prompt: spec.Prompt, Branch: spec.Branch, Base: spec.Base, Repo: spec.Repo,
	}); draftErr != nil {
		body = "Draft not saved: " + draftErr.Error() + "\n" + err.Error()
	} else {
		body = "The prompt is saved as a draft. Open the popup to use it.\n" + err.Error()
		_ = os.Remove(specPath)
	}
	notify("Worktree failed: "+failed, body, "request")
	return err
}

func notify(title, body, sound string) {
	if _, err := herdrCall(defaultTimeout, nil, "notification", "show", title, "--body", body, "--sound", sound); err != nil {
		fmt.Fprintln(os.Stderr, "notification:", err)
	}
}

// launch runs all the steps. It returns the agent and branch names.
func launch(spec JobSpec) (string, string, error) {
	if spec.Branch == "" {
		return launchAutoNamed(spec)
	}
	branch := spec.Branch
	var wt openedWorktree
	if branchHeld(spec.Repo, branch) {
		// Git permits one worktree per branch, so use the worktree that has it.
		if _, err := herdrCall(2*time.Minute, &wt, "worktree", "open", "--cwd", spec.Repo, "--branch", branch, "--no-focus"); err != nil {
			return "", branch, step("open worktree", err)
		}
	} else {
		if err := createWorktree(spec, branch, &wt); err != nil {
			return "", branch, err
		}
		if err := setupLerd(spec, wt); err != nil {
			return "", branch, err
		}
	}
	name, err := runAgent(wt, branchSlug(branch), spec)
	return name, branch, err
}

// launchAutoNamed uses Herdr's random branch and folder, so the agent does not
// wait for the naming command. The branch gets its name in the background, and
// the folder keeps the random name.
//
// lerd derives the domain and the database name from the branch, so a lerd
// project gets the name before its setup. The setup takes much longer anyway.
func launchAutoNamed(spec JobSpec) (string, string, error) {
	var wt openedWorktree
	if err := createWorktree(spec, "", &wt); err != nil {
		return "", "", err
	}
	random := wt.Worktree.Branch
	cfg := loadConfig()
	renamed := make(chan string, 1)
	go func() { renamed <- renameBranch(spec, wt, random, generateBranch(cfg, spec.Prompt)) }()

	if isLerd(spec, wt) {
		branch := <-renamed
		if err := setupLerd(spec, wt); err != nil {
			return "", branch, err
		}
		name, err := runAgent(wt, branchSlug(branch), spec)
		return name, branch, err
	}

	name, err := runAgent(wt, branchSlug(random), spec)
	branch := <-renamed
	if err == nil && branch != random {
		name = renameAgent(name, branchSlug(branch))
	}
	return name, branch, err
}

// runAgent starts the agent and gives it the prompt.
func runAgent(wt openedWorktree, slug string, spec JobSpec) (string, error) {
	name, err := startAgentIn(wt, slug, spec)
	if err != nil {
		return "", step("start agent", err)
	}
	if _, err := herdrCall(defaultTimeout, nil, "agent", "prompt", name, spec.Prompt); err != nil {
		return name, step("send prompt", err)
	}
	if err := waitForWork(name); err != nil {
		return name, step("wait for agent", err)
	}
	return name, nil
}

// openedWorktree is the part of `worktree create` and `worktree open` that the
// job reads.
type openedWorktree struct {
	AlreadyOpen bool `json:"already_open"`
	RootPane    struct {
		PaneID string `json:"pane_id"`
	} `json:"root_pane"`
	Workspace struct {
		WorkspaceID string `json:"workspace_id"`
	} `json:"workspace"`
	Worktree struct {
		Branch string `json:"branch"`
		Path   string `json:"path"`
	} `json:"worktree"`
}

// createWorktree makes a checkout. An empty branch makes Herdr pick a random
// branch and folder. Only a new branch records the base: Herdr ignores the base
// for an existing branch, which keeps its own.
func createWorktree(spec JobSpec, branch string, wt *openedWorktree) error {
	args := []string{"worktree", "create", "--cwd", spec.Repo}
	existing := false
	if branch != "" {
		_, existing = output(defaultTimeout, spec.Repo, "git", "show-ref", "--verify", "--quiet", "refs/heads/"+branch)
		args = append(args, "--branch", branch, "--label", branchSlug(branch))
	}
	args = append(args, "--base", spec.Base, "--no-focus")
	if _, err := herdrCall(2*time.Minute, wt, args...); err != nil {
		return step("create worktree", err)
	}
	if existing {
		return nil
	}
	if branch == "" {
		branch = wt.Worktree.Branch
	}
	if _, stderr, err := runCommand(defaultTimeout, spec.Repo, "", "git", "config",
		"branch."+branch+".gh-merge-base", spec.Base); err != nil {
		return step("record base branch", fmt.Errorf("%s: %w", strings.TrimSpace(stderr), err))
	}
	return nil
}

func isLerd(spec JobSpec, wt openedWorktree) bool {
	return isLerdProject(wt.Worktree.Path) || isLerdProject(spec.Repo)
}

func setupLerd(spec JobSpec, wt openedWorktree) error {
	if !isLerd(spec, wt) {
		return nil
	}
	return step("lerd setup", lerdSetup(wt.RootPane.PaneID))
}

// renameBranch gives the branch its final name and returns the name that the
// branch has at the end. The agent can already work in the checkout, so a lock
// can stop the rename for a short time. A failure never stops the job.
func renameBranch(spec JobSpec, wt openedWorktree, from, to string) string {
	to = uniqueName(to, func(name string) bool { return branchTaken(spec, name) })
	path := wt.Worktree.Path
	for attempt := 1; ; attempt++ {
		if reason := renameBlocked(path, from); reason != "" {
			fmt.Fprintf(os.Stderr, "branch %s keeps its name: %s\n", from, reason)
			return from
		}
		_, stderr, err := runCommand(defaultTimeout, path, "", "git", "branch", "-m", from, to)
		if err == nil {
			break
		}
		if attempt == renameAttempts {
			fmt.Fprintf(os.Stderr, "branch %s keeps its name: %s\n", from, strings.TrimSpace(stderr))
			return from
		}
		time.Sleep(renameRetryDelay)
	}
	if _, err := herdrCall(defaultTimeout, nil, "workspace", "rename", wt.Workspace.WorkspaceID, branchSlug(to)); err != nil {
		fmt.Fprintln(os.Stderr, "workspace rename:", err)
	}
	return to
}

// renameBlocked tells why the branch must keep its name. The agent can move to
// another branch, or push this one, before the name arrives.
func renameBlocked(path, branch string) string {
	current, _ := output(defaultTimeout, path, "git", "branch", "--show-current")
	if strings.TrimSpace(current) != branch {
		return "the checkout moved to another branch"
	}
	if _, ok := output(defaultTimeout, path, "git", "config", "--get", "branch."+branch+".remote"); ok {
		return "the branch has an upstream"
	}
	if _, ok := output(defaultTimeout, path, "git", "show-ref", "--verify", "--quiet", "refs/remotes/origin/"+branch); ok {
		return "the branch is on origin"
	}
	return ""
}

// renameAgent returns the name that the agent has at the end.
func renameAgent(name, slug string) string {
	live := liveAgentNames()
	target := agentName(slug, func(candidate string) bool { return live[candidate] })
	if _, err := herdrCall(defaultTimeout, nil, "agent", "rename", name, target); err != nil {
		fmt.Fprintln(os.Stderr, "agent rename:", err)
		return name
	}
	return target
}

// branchHeld tells if a worktree has the branch checked out.
func branchHeld(repo, branch string) bool {
	out, ok := output(defaultTimeout, repo, "git", "worktree", "list", "--porcelain")
	return ok && slices.Contains(strings.Split(out, "\n"), "branch refs/heads/"+branch)
}

// startAgentIn uses the root pane. A pane that was already open can stay busy,
// for example with another agent, so the agent then gets a new pane.
func startAgentIn(wt openedWorktree, slug string, spec JobSpec) (string, error) {
	root := wt.RootPane.PaneID
	if !wt.AlreadyOpen {
		return startAgent(slug, spec, root, agentBusyWait)
	}
	name, err := startAgent(slug, spec, root, 0)
	var he *herdrError
	if !errors.As(err, &he) || he.Code != "agent_pane_busy" {
		return name, err
	}
	var split struct {
		Pane struct {
			PaneID string `json:"pane_id"`
		} `json:"pane"`
	}
	if _, err := herdrCall(defaultTimeout, &split, "pane", "split", root,
		"--direction", "right", "--cwd", wt.Worktree.Path, "--no-focus"); err != nil {
		return name, err
	}
	return startAgent(slug, spec, split.Pane.PaneID, agentBusyWait)
}

// waitForWork confirms that the agent took the prompt. A TUI can lose the Enter
// when it has just left a dialog, and then the text stays in its input. So after
// a first timeout, send one Enter: it does nothing in an empty input, and it
// never sends the text again.
func waitForWork(name string) error {
	if err := waitAgent(name, agentEnterAfter); err == nil {
		return nil
	}
	if _, err := herdrCall(defaultTimeout, nil, "agent", "send-keys", name, "enter"); err != nil {
		return err
	}
	return waitAgent(name, agentWorkTimeout)
}

// waitAgent also accepts done and blocked, because a fast turn can end before
// the call starts.
func waitAgent(name string, timeout time.Duration) error {
	_, err := herdrCall(timeout+5*time.Second, nil, "agent", "wait", name,
		"--until", "working", "--until", "blocked", "--until", "done",
		"--timeout", strconv.FormatInt(timeout.Milliseconds(), 10))
	return err
}

// generateBranch asks the naming command, and uses a slug of the prompt if the
// command fails, gives no usable name or takes too long.
func generateBranch(cfg Config, prompt string) string {
	dir := os.Getenv("HERDR_PLUGIN_STATE_DIR")
	stdout, stderr, err := runCommand(namingTimeout, dir, namingPrompt(prompt), cfg.NamingCommand[0], cfg.NamingCommand[1:]...)
	if err == nil {
		if name, ok := sanitizeBranch(stdout); ok {
			return name
		}
		err = errors.New("no branch name in the output")
	}
	fmt.Fprintf(os.Stderr, "naming command: %v %s; use the prompt slug\n", err, strings.TrimSpace(stderr))
	return fallbackBranch(prompt, time.Now())
}

// branchTaken checks the local and origin branches.
func branchTaken(spec JobSpec, name string) bool {
	for _, ref := range []string{"refs/heads/" + name, "refs/remotes/origin/" + name} {
		if _, ok := output(defaultTimeout, spec.Repo, "git", "show-ref", "--verify", "--quiet", ref); ok {
			return true
		}
	}
	return false
}

func isLerdProject(dir string) bool {
	_, err := os.Stat(filepath.Join(dir, ".lerd.yaml"))
	return err == nil
}

// lerdCommand runs setup in the pane's shell, and prints a line with the exit
// status. The typed command does not match the regex, because it has no digits
// at the place of the status. `sh -c` keeps it independent of the user's shell.
func lerdCommand(marker string) (command, regex string) {
	command = fmt.Sprintf(`sh -c 'lerd worktree setup; printf "\n%s-%%s-END\n" "$?"'`, marker)
	return command, marker + "-[0-9]+-END"
}

func parseMarker(line, marker string) (int, bool) {
	match := regexp.MustCompile(marker + `-([0-9]+)-END`).FindStringSubmatch(line)
	if match == nil {
		return 0, false
	}
	code, err := strconv.Atoi(match[1])
	return code, err == nil
}

// lerdSetup retries while lerd's watcher has not seen the new worktree (exit 3).
func lerdSetup(pane string) error {
	deadline := time.Now().Add(lerdWatcherWait)
	for attempt := 1; ; attempt++ {
		marker := fmt.Sprintf("WTDONE-%d-%d", os.Getpid(), attempt)
		command, regex := lerdCommand(marker)
		if _, err := herdrCall(defaultTimeout, nil, "pane", "run", pane, command); err != nil {
			return err
		}
		var matched struct {
			MatchedLine string `json:"matched_line"`
		}
		if _, err := herdrCall(lerdSetupTimeout+time.Minute, &matched, "pane", "wait-output", pane,
			"--regex", regex, "--source", "recent-unwrapped", "--lines", "2000",
			"--timeout", strconv.FormatInt(lerdSetupTimeout.Milliseconds(), 10)); err != nil {
			return err
		}
		code, ok := parseMarker(matched.MatchedLine, marker)
		if !ok {
			return fmt.Errorf("no exit status in %q", matched.MatchedLine)
		}
		switch {
		case code == 0:
			return nil
		case code == lerdNotManaged && time.Now().Before(deadline):
			fmt.Fprintf(os.Stderr, "lerd worktree setup: attempt %d: not managed yet\n", attempt)
			time.Sleep(3 * time.Second)
		default:
			return fmt.Errorf("lerd worktree setup exited with status %d", code)
		}
	}
}

func liveAgentNames() map[string]bool {
	var result struct {
		Agents []struct {
			Name string `json:"name"`
		} `json:"agents"`
	}
	names := map[string]bool{}
	if _, err := herdrCall(defaultTimeout, &result, "agent", "list"); err == nil {
		for _, agent := range result.Agents {
			names[agent.Name] = true
		}
	}
	return names
}

// waitForDialog handles an agent that asks a question at startup, such as the
// folder trust dialog of Claude. Only the user can answer it.
func waitForDialog(name string) error {
	notify("Agent "+name+" needs an answer", "Answer its startup dialog. The prompt follows when the agent is ready.", "request")
	_, err := herdrCall(agentDialogTimeout+5*time.Second, nil, "agent", "wait", name,
		"--until", "idle", "--until", "done",
		"--timeout", strconv.FormatInt(agentDialogTimeout.Milliseconds(), 10))
	return err
}

// startAgent retries for busyWait while the shell is not yet at its prompt.
func startAgent(slug string, spec JobSpec, pane string, busyWait time.Duration) (string, error) {
	deadline := time.Now().Add(busyWait)
	for {
		live := liveAgentNames()
		name := agentName(slug, func(candidate string) bool { return live[candidate] })
		args := []string{"agent", "start", name, "--kind", spec.Agent, "--pane", pane,
			"--timeout", strconv.FormatInt(agentStartTimeout.Milliseconds(), 10)}
		if flags := agentArgs(spec.Agent, spec.Model, spec.Effort); len(flags) > 0 {
			args = append(append(args, "--"), flags...)
		}
		_, err := herdrCall(agentStartTimeout+15*time.Second, nil, args...)
		if err == nil {
			return name, nil
		}
		var he *herdrError
		if errors.As(err, &he) && he.Code == "agent_not_ready" {
			return name, waitForDialog(name)
		}
		if !errors.As(err, &he) || he.Code != "agent_pane_busy" || time.Now().After(deadline) {
			return name, err
		}
		time.Sleep(time.Second)
	}
}
