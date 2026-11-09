package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const (
	wtSwitchTimeout    = 30 * time.Minute
	wtPollInterval     = 300 * time.Millisecond
	agentBusyWait      = 60 * time.Second
	agentStartTimeout  = 90 * time.Second
	agentEnterAfter    = 8 * time.Second
	agentWorkTimeout   = 25 * time.Second
	agentDialogTimeout = 15 * time.Minute
	failureLines       = 4
)

// JobSpec is the work that the popup gives to the detached job. An empty prompt
// opens the worktree with a shell only.
type JobSpec struct {
	Selection
	Repo     string `json:"repo"`
	RepoName string `json:"repo_name"`
	Prompt   string `json:"prompt"`
	Branch   string `json:"branch,omitempty"`
	Base     string `json:"base"`
	Focus    bool   `json:"focus,omitempty"`
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
	logPath := strings.TrimSuffix(specPath, ".json") + ".wt.log"
	name, branch, err := launch(spec, logPath)
	if err == nil {
		if spec.Prompt != "" {
			notify("Agent "+name+" has the prompt", branch+" in "+spec.RepoName, "done")
		}
		_ = os.Remove(specPath)
		return nil
	}

	failed := "launch"
	var se *stepError
	if errors.As(err, &se) {
		failed = se.step
	}
	if spec.Prompt == "" {
		notify("Worktree failed: "+failed, err.Error(), "request")
		_ = os.Remove(specPath)
		return err
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

// launch names the branch, opens its worktree and starts the agent. It returns
// the agent and branch names.
func launch(spec JobSpec, logPath string) (string, string, error) {
	branch := spec.Branch
	if branch == "" {
		branch = uniqueName(generateBranch(loadConfig(), spec.Prompt),
			func(name string) bool { return branchTaken(spec.Repo, name) })
	}
	var wt openedWorktree
	if path, ok := worktreePath(spec.Repo, branch); ok {
		// Git permits one worktree per branch, so use the worktree that has it.
		if err := openWorktree(spec.Repo, path, "", spec.Focus, &wt); err != nil {
			return "", branch, step("open worktree", err)
		}
	} else if err := switchWorktree(spec, branch, logPath, &wt); err != nil {
		return "", branch, err
	}
	if spec.Prompt == "" {
		return "", branch, nil
	}
	name, err := runAgent(wt, branchSlug(branch), spec)
	return name, branch, err
}

// openWorktree opens a checkout of repo. Herdr finds the worktree only from the
// main checkout: without --cwd it fails with worktree_not_found.
func openWorktree(repo, path, label string, focus bool, wt *openedWorktree) error {
	args := []string{"worktree", "open", "--cwd", repo, "--path", path}
	if label != "" {
		args = append(args, "--label", label)
	}
	if focus {
		args = append(args, "--focus")
	} else {
		args = append(args, "--no-focus")
	}
	_, err := herdrCall(2*time.Minute, wt, args...)
	return err
}

// switchWorktree runs `wt switch`, which also runs the repository's hooks. Its
// output goes to logPath. As soon as the checkout exists, its workspace opens and
// the root pane shows the log until wt exits.
func switchWorktree(spec JobSpec, branch, logPath string, wt *openedWorktree) error {
	exists := refExists(spec.Repo, "refs/heads/"+branch) || remoteHas(spec.Repo, branch)
	args := []string{"-C", spec.Repo, "switch"}
	if exists {
		args = append(args, branch)
	} else {
		args = append(args, "--create", branch, "--base", spec.Base)
	}
	args = append(args, "--no-cd", "--yes", "--format=json")

	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return step("wt switch", err)
	}
	defer logFile.Close()
	var stdout bytes.Buffer
	cmd := exec.Command(wtBin(), args...)
	cmd.Dir = spec.Repo
	cmd.Stdout, cmd.Stderr = &stdout, logFile
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err := cmd.Start(); err != nil {
		return step("wt switch", err)
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	kill := func() { _ = syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL); <-done }

	opened := false
	open := func(path string) error {
		if err := openWorktree(spec.Repo, path, branchSlug(branch), spec.Focus, wt); err != nil {
			return err
		}
		opened = true
		if !exists {
			recordBase(spec.Repo, branch, spec.Base)
		}
		return nil
	}
	deadline := time.Now().Add(wtSwitchTimeout)
	var waitErr error
wait:
	for {
		if !opened {
			if path, ok := worktreePath(spec.Repo, branch); ok {
				if err := open(path); err != nil {
					// A kill would stop the hooks halfway, for example in a
					// database clone. Let wt finish the checkout.
					select {
					case <-done:
					case <-time.After(time.Until(deadline)):
						kill()
					}
					return step("open worktree", err)
				}
				showLog(wt.RootPane.PaneID, cmd.Process.Pid, logPath)
			}
		}
		select {
		case waitErr = <-done:
			break wait
		case <-time.After(wtPollInterval):
		}
		if time.Now().After(deadline) {
			kill()
			return step("wt switch", fmt.Errorf("timeout after %s", wtSwitchTimeout))
		}
	}
	if !opened {
		// wt was faster than the poll. A failed hook can leave the checkout.
		path, ok := worktreePath(spec.Repo, branch)
		if waitErr == nil {
			var result struct {
				Path string `json:"path"`
			}
			if json.Unmarshal(stdout.Bytes(), &result) == nil && result.Path != "" {
				path, ok = result.Path, true
			}
		}
		if ok {
			if err := open(path); err != nil && waitErr == nil {
				return step("open worktree", err)
			}
			if opened {
				showLog(wt.RootPane.PaneID, cmd.Process.Pid, logPath)
			}
		} else if waitErr == nil {
			return step("wt switch", fmt.Errorf("no path in %q", stdout.String()))
		}
	}
	if waitErr != nil {
		return step("wt switch", fmt.Errorf("%w\n%s", waitErr, lastLines(logPath, failureLines)))
	}
	return nil
}

// showLog follows the log in the pane until the process exits.
func showLog(pane string, pid int, logPath string) {
	command := fmt.Sprintf("clear; tail -n +1 -F --pid=%d %s", pid, shellQuote(logPath))
	if _, err := herdrCall(defaultTimeout, nil, "pane", "run", pane, command); err != nil {
		fmt.Fprintln(os.Stderr, "show log:", err)
	}
}

func shellQuote(s string) string { return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'" }

func lastLines(path string, n int) string {
	raw, _ := os.ReadFile(path)
	lines := strings.Split(strings.TrimRight(string(raw), "\n"), "\n")
	return strings.Join(lines[max(len(lines)-n, 0):], "\n")
}

// recordBase keeps the base for the PR and for the merge view.
func recordBase(repo, branch, base string) {
	if _, stderr, err := runCommand(defaultTimeout, repo, "", "git", "config",
		"branch."+branch+".gh-merge-base", base); err != nil {
		fmt.Fprintf(os.Stderr, "record base: %s: %v\n", strings.TrimSpace(stderr), err)
	}
}

func refExists(repo, ref string) bool {
	_, ok := output(defaultTimeout, repo, "git", "show-ref", "--verify", "--quiet", ref)
	return ok
}

func remoteHas(repo, branch string) bool { return loadBranches(repo).remote[branch] }

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

// branchTaken checks the local and remote branches.
func branchTaken(repo, name string) bool {
	return refExists(repo, "refs/heads/"+name) || remoteHas(repo, name)
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
