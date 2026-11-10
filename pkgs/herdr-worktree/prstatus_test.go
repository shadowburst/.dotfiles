package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRefreshKeepsMergedWorktree(t *testing.T) {
	f := useFakes(t)
	repo := gitRepo(t)
	checkout := filepath.Join(filepath.Dir(repo), "holder")
	runGit(t, repo, "remote", "add", "origin", "https://github.com/example/repo.git")
	t.Setenv("FAKE_CHECKOUT_PATH", checkout)
	t.Setenv("FAKE_REPO_ROOT", repo)
	t.Setenv("FAKE_PR_HEAD", runGit(t, checkout, "rev-parse", "HEAD"))
	dir := filepath.Dir(os.Getenv("HERDR_BIN_PATH"))
	for name, body := range map[string]string{
		"herdr": `#!/bin/sh
printf '%s\n' "$*" >> "$FAKE_HERDR_LOG"
if [ "$1 $2" = "workspace list" ]; then
	printf '{"result":{"workspaces":[{"workspace_id":"w1","agent_status":"idle","worktree":{"checkout_path":"%s","repo_root":"%s","is_linked_worktree":true}}]}}\n' "$FAKE_CHECKOUT_PATH" "$FAKE_REPO_ROOT"
else
	echo '{"result":{}}'
fi
`,
		"gh": `#!/bin/sh
printf '{"number":7,"state":"MERGED","headRefOid":"%s"}\n' "$FAKE_PR_HEAD"
`,
	} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0o700); err != nil {
			t.Fatal(err)
		}
	}
	t.Setenv("PATH", dir+string(os.PathListSeparator)+os.Getenv("PATH"))

	refresh("")

	wantCall(t, f.herdr(), "workspace report-metadata w1 --source "+source+" --token pr= #7")
	wantNoCall(t, f.herdr(), "workspace close")
	if got := f.wt(); got != "" {
		t.Errorf("unexpected wt call: %s", got)
	}
	if _, err := os.Stat(checkout); err != nil {
		t.Errorf("worktree was removed: %v", err)
	}
}

func TestPRLabel(t *testing.T) {
	tests := []struct {
		pr   pullRequest
		want string
	}{
		{pullRequest{Number: 7, State: "OPEN"}, " #7"},
		{pullRequest{Number: 7, State: "OPEN", IsDraft: true}, " #7"},
		{pullRequest{Number: 7, State: "MERGED"}, " #7"},
		{pullRequest{Number: 7, State: "CLOSED"}, " #7"},
		{pullRequest{Number: 7, State: "OPEN", ReviewDecision: "APPROVED"}, " #7 "},
		{pullRequest{Number: 7, State: "OPEN", ReviewDecision: "CHANGES_REQUESTED"}, " #7 "},
	}
	for _, tt := range tests {
		if got := prLabel(tt.pr); got != tt.want {
			t.Errorf("got %q, want %q", got, tt.want)
		}
	}
}
