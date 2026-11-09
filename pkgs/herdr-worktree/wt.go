package main

// The worktrunk CLI (`wt`) and the repository data that the popup shows.

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"
)

const wtListTimeout = 30 * time.Second

func wtBin() string {
	if bin := os.Getenv("HERDR_WORKTREE_WT"); bin != "" {
		return bin
	}
	return "wt"
}

// row is one line of the list: a worktree, a local branch, or a branch that
// only a remote has.
type row struct {
	Branch string // empty for a detached worktree
	Remote string // set only on a remote-only branch
	Path   string // empty for a branch without a worktree
	Main   bool
	Dirty  bool
	Merged bool // the default branch has its changes
	Ahead  int
	Behind int
	PR     int

	Agent      string // kind of the first agent in the checkout
	Busy       bool   // an agent works or waits for a permission
	Workspaces []string
}

func (r row) name() string {
	if r.Branch == "" {
		return "(detached)"
	}
	return r.Branch
}

// forceDelete is true when only an unmerged branch is left to remove: without
// --force-delete, `wt remove` keeps it and does nothing. A worktree removal keeps
// the unmerged branch, as wt does by default.
func (r row) forceDelete() bool { return r.Path == "" && r.Remote == "" && !r.Merged }

// gitRef is the directory and the ref that git uses for the row.
func (r row) gitRef(repo string) (string, string) {
	switch {
	case r.Branch == "":
		return r.Path, "HEAD"
	case r.Remote != "":
		return repo, r.Remote + "/" + r.Branch
	}
	return repo, r.Branch
}

type wtItem struct {
	Branch   *string `json:"branch"`
	Remote   string  `json:"remote"`
	Worktree *struct {
		Path    string `json:"path"`
		Main    bool   `json:"main"`
		Changes struct {
			Staged, Modified, Untracked, Renamed, Deleted, Conflicted bool
		} `json:"changes"`
	} `json:"worktree"`
	DefaultBranch *struct {
		Ahead       *int      `json:"ahead"`
		Behind      *int      `json:"behind"`
		Integration *struct{} `json:"integration"`
	} `json:"default_branch"`
	PR *struct {
		Number *int `json:"number"`
	} `json:"pr"`
}

type wtList struct {
	Repo struct {
		DefaultBranch string `json:"default_branch"`
	} `json:"repo"`
	Items []wtItem `json:"items"`
}

// parseRows reads `wt list --format=json`. A remote row that has a local branch
// with the same name is dropped.
func parseRows(raw []byte) (string, []row, error) {
	var list wtList
	if err := json.Unmarshal(raw, &list); err != nil {
		return "", nil, fmt.Errorf("decode wt list: %w", err)
	}
	local := map[string]bool{}
	for _, it := range list.Items {
		if it.Remote == "" && it.Branch != nil {
			local[*it.Branch] = true
		}
	}
	var rows []row
	for _, it := range list.Items {
		var r row
		if it.Branch != nil {
			r.Branch = *it.Branch
		}
		r.Remote = it.Remote
		if r.Remote != "" && local[r.Branch] {
			continue
		}
		if w := it.Worktree; w != nil {
			r.Path, r.Main = w.Path, w.Main
			c := w.Changes
			r.Dirty = c.Staged || c.Modified || c.Untracked || c.Renamed || c.Deleted || c.Conflicted
		}
		if d := it.DefaultBranch; d != nil {
			r.Merged = d.Integration != nil
			if d.Ahead != nil {
				r.Ahead = *d.Ahead
			}
			if d.Behind != nil {
				r.Behind = *d.Behind
			}
		}
		if it.PR != nil && it.PR.Number != nil {
			r.PR = *it.PR.Number
		}
		rows = append(rows, r)
	}
	return list.Repo.DefaultBranch, rows, nil
}

// loadRows lists the repository. full also asks the forge for the PRs, which
// needs the network.
func loadRows(repo string, full bool) (string, []row, error) {
	args := []string{"-C", repo, "list", "--format=json", "--branches", "--remotes"}
	if full {
		args = append(args, "--full")
	}
	stdout, stderr, err := runCommand(wtListTimeout, repo, "", wtBin(), args...)
	if err != nil {
		return "", nil, fmt.Errorf("wt list: %s: %w", strings.TrimSpace(stderr), err)
	}
	return parseRows([]byte(stdout))
}

type herdrAgent struct {
	Agent       string `json:"agent"`
	AgentStatus string `json:"agent_status"`
	Cwd         string `json:"cwd"`
	WorkspaceID string `json:"workspace_id"`
}

func agentBusy(status string) bool { return status == "working" || status == "blocked" }

func herdrAgents() []herdrAgent {
	var result struct {
		Agents []herdrAgent `json:"agents"`
	}
	if _, err := herdrCall(defaultTimeout, &result, "agent", "list"); err != nil {
		return nil
	}
	return result.Agents
}

// attachHerdr adds the workspaces and the agents of each checkout. An agent
// belongs to the checkout of its workspace, else to the checkout with the
// longest path that holds its cwd (worktrees can be inside the main checkout).
func attachHerdr(rows []row, spaces []workspace, agents []herdrAgent) {
	byPath := map[string]int{}
	for i, r := range rows {
		if r.Path != "" {
			byPath[filepath.Clean(r.Path)] = i
		}
	}
	wsRow := map[string]int{}
	for _, ws := range spaces {
		if ws.Worktree == nil {
			continue
		}
		if i, ok := byPath[filepath.Clean(ws.Worktree.CheckoutPath)]; ok {
			rows[i].Workspaces = append(rows[i].Workspaces, ws.WorkspaceID)
			wsRow[ws.WorkspaceID] = i
		}
	}
	for _, a := range agents {
		i, ok := wsRow[a.WorkspaceID]
		if !ok {
			i, ok = holder(byPath, a.Cwd)
		}
		if !ok {
			continue
		}
		if rows[i].Agent == "" || (agentBusy(a.AgentStatus) && !rows[i].Busy) {
			rows[i].Agent = a.Agent
		}
		rows[i].Busy = rows[i].Busy || agentBusy(a.AgentStatus)
	}
}

func holder(byPath map[string]int, cwd string) (int, bool) {
	if cwd == "" {
		return 0, false
	}
	best, found := "", false
	for path := range byPath {
		if (cwd == path || strings.HasPrefix(cwd, path+"/")) && len(path) > len(best) {
			best, found = path, true
		}
	}
	return byPath[best], found
}

// worktreePath finds the worktree that has the branch checked out.
func worktreePath(repo, branch string) (string, bool) {
	out, ok := output(defaultTimeout, repo, "git", "worktree", "list", "--porcelain")
	if !ok {
		return "", false
	}
	path := ""
	for line := range strings.SplitSeq(out, "\n") {
		if p, ok := strings.CutPrefix(line, "worktree "); ok {
			path = p
		}
		if line == "branch refs/heads/"+branch {
			return path, true
		}
	}
	return "", false
}

// branchSet holds the local branches and the branches of the remotes, without
// the remote name.
type branchSet struct {
	names  []string // sorted, for the suggestions
	local  map[string]bool
	remote map[string]bool
}

func (b branchSet) has(name string) bool { return b.local[name] || b.remote[name] }

func loadBranches(repo string) branchSet {
	b := branchSet{local: map[string]bool{}, remote: map[string]bool{}}
	out, _ := output(defaultTimeout, repo, "git", "for-each-ref", "--format=%(refname)", "refs/heads", "refs/remotes")
	for ref := range strings.SplitSeq(strings.TrimSpace(out), "\n") {
		if name, ok := strings.CutPrefix(ref, "refs/heads/"); ok {
			b.local[name] = true
		} else if rest, ok := strings.CutPrefix(ref, "refs/remotes/"); ok {
			if _, name, ok := strings.Cut(rest, "/"); ok && name != "HEAD" {
				b.remote[name] = true
			}
		}
	}
	for name := range b.local {
		b.names = append(b.names, name)
	}
	for name := range b.remote {
		if !b.local[name] {
			b.names = append(b.names, name)
		}
	}
	slices.Sort(b.names)
	return b
}

// mergeBase is the base that the plugin recorded for the branch.
func mergeBase(repo, branch string) string {
	out, _ := output(defaultTimeout, repo, "git", "config", "--get", "branch."+branch+".gh-merge-base")
	return strings.TrimSpace(out)
}
