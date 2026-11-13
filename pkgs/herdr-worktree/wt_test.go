package main

import (
	"reflect"
	"testing"
)

func TestParseRows(t *testing.T) {
	raw := `{"schema":2,"repo":{"default_branch":"main"},"items":[
	{"branch":"main","worktree":{"path":"/r","main":true,"changes":{}}},
	{"branch":"feat/a","worktree":{"path":"/w/a","main":false,"changes":{"untracked":true}},
	 "default_branch":{"ahead":2,"behind":1},"pr":{"number":41}},
	{"branch":null,"worktree":{"path":"/w/d","changes":{}}},
	{"branch":"feat/b","default_branch":{"ahead":null,"behind":null}},
	{"branch":"done","default_branch":{"ahead":0,"behind":3,"integration":{"reason":"ancestor"}}},
	{"branch":"feat/b","remote":"origin"},
	{"branch":"only","remote":"origin"}]}`
	def, rows, err := parseRows([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	want := []row{
		{Branch: "main", Path: "/r", Main: true},
		{Branch: "feat/a", Path: "/w/a", Dirty: true, Ahead: 2, Behind: 1, PR: 41},
		{Path: "/w/d"},
		{Branch: "feat/b"},
		{Branch: "done", Merged: true, Behind: 3},
		{Branch: "only", Remote: "origin"},
	}
	if def != "main" || !reflect.DeepEqual(rows, want) {
		t.Errorf("def = %q\nrows = %+v", def, rows)
	}
}

func TestAttachHerdr(t *testing.T) {
	rows := []row{{Branch: "main", Path: "/r", Main: true}, {Branch: "a", Path: "/r/.wt/a"}, {Branch: "b", Path: "/w/b"}}
	spaces := []workspace{
		{WorkspaceID: "w1", Worktree: &worktreeInfo{CheckoutPath: "/r"}},
		{WorkspaceID: "w2", Worktree: &worktreeInfo{CheckoutPath: "/w/b"}},
	}
	agents := []herdrAgent{
		{Agent: "codex", AgentStatus: "idle", WorkspaceID: "w2", Cwd: "/elsewhere"},
		{Agent: "claude", AgentStatus: "working", WorkspaceID: "w9", Cwd: "/r/.wt/a/src"},
	}
	attachHerdr(rows, spaces, agents)
	if r := rows[0]; r.Agent != "" || !reflect.DeepEqual(r.Workspaces, []string{"w1"}) {
		t.Errorf("main = %+v", r)
	}
	if r := rows[1]; r.Agent != "claude" || !r.Busy {
		t.Errorf("nested worktree = %+v", r)
	}
	if r := rows[2]; r.Agent != "codex" || r.Busy || !reflect.DeepEqual(r.Workspaces, []string{"w2"}) {
		t.Errorf("b = %+v", r)
	}
}
