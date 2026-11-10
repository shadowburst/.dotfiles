package main

// Shows each Space's GitHub PR as the `$pr` token.
// Based on https://github.com/Flyingdot/herdr-pr-status (MIT).

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
	CheckoutPath string `json:"checkout_path"`
}

type workspace struct {
	WorkspaceID string        `json:"workspace_id"`
	Focused     bool          `json:"focused"`
	Worktree    *worktreeInfo `json:"worktree"`
}

type pullRequest struct {
	Number         int    `json:"number"`
	State          string `json:"state"`
	IsDraft        bool   `json:"isDraft"`
	ReviewDecision string `json:"reviewDecision"`
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
	out, ok := output(defaultTimeout, path, "gh", "pr", "view", "--json", "number,state,isDraft,reviewDecision")
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
