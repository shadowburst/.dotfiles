package main

// Shows each Space's GitHub PR as the `$pr` token, and removes merged worktrees.
// Based on https://github.com/Flyingdot/herdr-pr-status (MIT).
//
// It removes a merged worktree with `wt remove`, so the repository's remove
// hooks run, and then closes the Space.

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const (
	source         = "pbaudry.worktree"
	pollInterval   = 120 * time.Second
	removeLimit    = 600 * time.Second
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
	Focused     bool          `json:"focused"`
	AgentStatus string        `json:"agent_status"`
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
// A dirty worktree is kept. statusOK is false when
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

// removeWorktree keeps a Space where an agent works.
func removeWorktree(ws workspace) bool {
	if agentBusy(ws.AgentStatus) {
		return false
	}
	wt := *ws.Worktree
	branch, _ := output(defaultTimeout, wt.CheckoutPath, "git", "branch", "--show-current")
	if branch = strings.TrimSpace(branch); branch == "" {
		return false
	}
	if _, stderr, err := runCommand(removeLimit, wt.RepoRoot, "", wtBin(),
		"-C", wt.RepoRoot, "remove", branch, "--yes", "--foreground"); err != nil {
		fmt.Fprintf(os.Stderr, "wt remove %s: %v: %s\n", branch, err, strings.TrimSpace(stderr))
		return false
	}
	_, err := herdrCall(defaultTimeout, nil, "workspace", "close", ws.WorkspaceID)
	return err == nil
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
		if pr != nil && checkMerged(*pr, wt) && removeWorktree(ws) {
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
