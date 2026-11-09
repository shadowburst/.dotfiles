package main

import (
	"encoding/json"
	"path/filepath"
	"slices"
	"strings"
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

// focusedCheckout is the checkout of the focused Space.
func focusedCheckout(cwds []string) string {
	if len(cwds) == 0 {
		return ""
	}
	out, _ := output(defaultTimeout, cwds[0], "git", "rev-parse", "--show-toplevel")
	return strings.TrimSpace(out)
}
