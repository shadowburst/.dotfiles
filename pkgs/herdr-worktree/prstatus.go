package main

// Shows each Space's GitHub PR as the `$pr` token, and removes merged worktrees.
// Based on https://github.com/Flyingdot/herdr-pr-status (MIT).
//
// Before it removes a merged worktree, it runs `teardown` from the plugin
// config with bash, in the worktree, with WORKTREE_PATH, WORKTREE_BRANCH,
// REPO_ROOT and PR_NUMBER set. If the teardown fails, the worktree stays. If the
// teardown removed the checkout, the Space is closed.

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const (
	source         = "pbaudry.worktree"
	pollInterval   = 120 * time.Second
	teardownLimit  = 600 * time.Second
	tokenTTLMillis = 3 * 120 * 1000 // stale values vanish if the poller dies
)

// Nerd Font octicons, one per state, so sidebar rules can color by state.
var stateIcons = map[string]string{
	"open":   "", // nf-oct-git_pull_request
	"draft":  "", // nf-oct-git_pull_request_draft
	"merged": "", // nf-oct-git_merge
	"closed": "", // nf-oct-git_pull_request_closed
}

var reviewIcons = map[string]string{
	"APPROVED":          "", // nf-oct-check
	"CHANGES_REQUESTED": "", // nf-oct-x
}

type worktreeInfo struct {
	CheckoutPath     string `json:"checkout_path"`
	IsLinkedWorktree bool   `json:"is_linked_worktree"`
	RepoRoot         string `json:"repo_root"`
}

type workspace struct {
	WorkspaceID string        `json:"workspace_id"`
	Worktree    *worktreeInfo `json:"worktree"`
}

type pullRequest struct {
	Number         int    `json:"number"`
	State          string `json:"state"`
	IsDraft        bool   `json:"isDraft"`
	ReviewDecision string `json:"reviewDecision"`
	HeadRefOid     string `json:"headRefOid"`
}

func workspaces() []workspace {
	var result struct {
		Workspaces []workspace `json:"workspaces"`
	}
	if _, err := herdrCall(defaultTimeout, &result, "workspace", "list"); err != nil {
		return nil
	}
	return result.Workspaces
}

func fetchPullRequest(path string) *pullRequest {
	remote, _ := output(defaultTimeout, path, "git", "config", "--get", "remote.origin.url")
	if !strings.Contains(remote, "github.com") {
		return nil
	}
	out, ok := output(defaultTimeout, path, "gh", "pr", "view", "--json", "number,state,isDraft,reviewDecision,headRefOid")
	if !ok {
		return nil
	}
	var pr pullRequest
	if json.Unmarshal([]byte(out), &pr) != nil {
		return nil
	}
	return &pr
}

func prLabel(pr pullRequest) string {
	state := strings.ToLower(pr.State)
	if pr.IsDraft && pr.State == "OPEN" {
		state = "draft"
	}
	label := fmt.Sprintf("%s #%d", stateIcons[state], pr.Number)
	if review := reviewIcons[pr.ReviewDecision]; review != "" {
		label += " " + review
	}
	return label
}

// mergedAndDone is true when the PR is merged and the worktree has no commits
// after the merged head. The main checkout is never removed. A worktree with
// new commits (for example a long-lived branch whose old PR was merged) is kept.
// A dirty worktree is kept, before any teardown runs. statusOK is false when
// `git status` failed, and that also keeps the worktree.
func mergedAndDone(pr pullRequest, isLinked bool, head, porcelain string, statusOK bool) bool {
	if pr.State != "MERGED" || !isLinked {
		return false
	}
	return strings.TrimSpace(head) == pr.HeadRefOid && statusOK && porcelain == ""
}

func checkMerged(pr pullRequest, wt worktreeInfo) bool {
	if pr.State != "MERGED" || !wt.IsLinkedWorktree {
		return false
	}
	head, _ := output(defaultTimeout, wt.CheckoutPath, "git", "rev-parse", "HEAD")
	porcelain, ok := output(defaultTimeout, wt.CheckoutPath, "git", "status", "--porcelain")
	return mergedAndDone(pr, wt.IsLinkedWorktree, head, porcelain, ok)
}

func removeWorktree(id string, wt worktreeInfo, pr pullRequest) bool {
	path := wt.CheckoutPath
	if teardown := loadConfig().Teardown; teardown != "" {
		branch, _ := output(defaultTimeout, path, "git", "branch", "--show-current")
		cmd := exec.Command("bash", "-c", teardown)
		cmd.Dir = path
		cmd.Env = append(os.Environ(),
			"WORKTREE_PATH="+path,
			"WORKTREE_BRANCH="+strings.TrimSpace(branch),
			"REPO_ROOT="+wt.RepoRoot,
			"PR_NUMBER="+strconv.Itoa(pr.Number),
		)
		cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
		cmd.WaitDelay = time.Second
		if err := startAndWait(cmd, teardownLimit); err != nil {
			fmt.Fprintf(os.Stderr, "teardown failed for %s (%v); worktree kept\n", path, err)
			return false
		}
	}
	if info, err := os.Stat(path); err == nil && info.IsDir() {
		_, err := herdrCall(defaultTimeout, nil, "worktree", "remove", "--workspace", id)
		return err == nil
	}
	_, err := herdrCall(defaultTimeout, nil, "workspace", "close", id)
	return err == nil
}

func startAndWait(cmd *exec.Cmd, limit time.Duration) error {
	if err := cmd.Start(); err != nil {
		return err
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	select {
	case err := <-done:
		return err
	case <-time.After(limit):
		_ = cmd.Process.Kill()
		<-done
		return fmt.Errorf("timeout after %s", limit)
	}
}

func refresh(only string) {
	for _, ws := range workspaces() {
		if only != "" && ws.WorkspaceID != only {
			continue
		}
		var pr *pullRequest
		var wt worktreeInfo
		if ws.Worktree != nil {
			wt = *ws.Worktree
		}
		if wt.CheckoutPath != "" {
			pr = fetchPullRequest(wt.CheckoutPath)
		}
		if pr != nil && checkMerged(*pr, wt) && removeWorktree(ws.WorkspaceID, wt, *pr) {
			continue
		}
		args := []string{"workspace", "report-metadata", ws.WorkspaceID, "--source", source}
		if pr != nil {
			args = append(args, "--token", "pr="+prLabel(*pr), "--ttl-ms", strconv.Itoa(tokenTTLMillis))
		} else {
			args = append(args, "--clear-token", "pr")
		}
		_, _ = herdrCall(defaultTimeout, nil, args...)
	}
}

func daemon() {
	stateDir := os.Getenv("HERDR_PLUGIN_STATE_DIR")
	if stateDir == "" {
		stateDir = "/tmp"
	}
	pidfile := filepath.Join(stateDir, "daemon.pid")
	if raw, err := os.ReadFile(pidfile); err == nil {
		if pid, err := strconv.Atoi(strings.TrimSpace(string(raw))); err == nil && pid > 0 && syscall.Kill(pid, 0) == nil {
			return // already running
		}
	}
	if err := os.WriteFile(pidfile, []byte(strconv.Itoa(os.Getpid())), 0o644); err != nil {
		fmt.Fprintln(os.Stderr, "herdr-worktree:", err)
		return
	}
	for {
		refresh("")
		time.Sleep(pollInterval)
	}
}
