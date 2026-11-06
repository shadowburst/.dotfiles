package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// fakeHerdr answers with the JSON shapes of Herdr 0.9.5 and records each call.
const fakeHerdr = `#!/bin/sh
randomBranch=worktree/lucky-harbor-bae4
printf '%s\n' "$*" >> "$FAKE_HERDR_LOG"
case "$1 $2" in
"worktree create")
	if [ -n "$FAKE_CREATE_ERROR" ]; then
		printf '{"error":{"code":"worktree_create_failed","message":"%s"}}' "$FAKE_CREATE_ERROR" >&2
		exit 1
	fi
	case "$*" in
	*"--branch "*)
		echo '{"result":{"root_pane":{"pane_id":"w2:p1"},"worktree":{"path":"/created"}}}'
		;;
	*)
		echo "{\"result\":{\"root_pane\":{\"pane_id\":\"w2:p1\"},\"workspace\":{\"workspace_id\":\"w2\"},\"worktree\":{\"branch\":\"$randomBranch\",\"path\":\"$FAKE_RANDOM_PATH\"}}}"
		;;
	esac
	;;
"pane wait-output")
	marker=$(printf '%s' "$*" | sed -n 's/.*--regex \(WTDONE-[0-9]*-[0-9]*\)-.*/\1/p')
	echo "{\"result\":{\"matched_line\":\"$marker-0-END\"}}"
	;;
"worktree open")
	echo "{\"result\":{\"already_open\":${FAKE_ALREADY_OPEN:-false},\"root_pane\":{\"pane_id\":\"w1:p1\"},\"worktree\":{\"path\":\"/held\"}}}"
	;;
"pane split")
	echo '{"result":{"pane":{"pane_id":"w1:p2"}}}'
	;;
"agent list")
	echo '{"result":{"agents":[]}}'
	;;
"agent start")
	case "$*" in
	*"--pane w1:p1"*)
		if [ -n "$FAKE_ROOT_BUSY" ]; then
			echo '{"error":{"code":"agent_pane_busy","message":"not an available shell"}}' >&2
			exit 1
		fi
		;;
	esac
	echo '{"result":{}}'
	;;
*)
	echo '{"result":{}}'
	;;
esac
`

// gitRepo has the branches held (in a linked worktree) and free. Both have a
// recorded base, like a branch that an earlier workflow made.
func gitRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	repo := filepath.Join(dir, "repo")
	runGit(t, "", "init", "-q", "-b", "main", repo)
	runGit(t, repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init")
	for _, branch := range []string{"held", "free"} {
		runGit(t, repo, "branch", branch)
		runGit(t, repo, "config", "branch."+branch+".gh-merge-base", "feat/original")
	}
	runGit(t, repo, "worktree", "add", "-q", filepath.Join(dir, "holder"), "held")
	return repo
}

func runGit(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
	return strings.TrimSpace(string(out))
}

// useFakeHerdr returns a function that reads the recorded calls.
func useFakeHerdr(t *testing.T) func() string {
	t.Helper()
	dir := t.TempDir()
	bin := filepath.Join(dir, "herdr")
	if err := os.WriteFile(bin, []byte(fakeHerdr), 0o700); err != nil {
		t.Fatal(err)
	}
	log := filepath.Join(dir, "calls.log")
	t.Setenv("HERDR_BIN_PATH", bin)
	t.Setenv("FAKE_HERDR_LOG", log)
	t.Setenv("FAKE_CREATE_ERROR", "")
	t.Setenv("FAKE_ALREADY_OPEN", "")
	t.Setenv("FAKE_ROOT_BUSY", "")
	t.Setenv("FAKE_RANDOM_PATH", "")
	t.Setenv("HERDR_PLUGIN_STATE_DIR", t.TempDir())
	t.Setenv("HERDR_PLUGIN_CONFIG_DIR", t.TempDir())
	return func() string {
		raw, err := os.ReadFile(log)
		if err != nil {
			t.Fatal(err)
		}
		return string(raw)
	}
}

func testSpec(repo, branch string) JobSpec {
	return JobSpec{
		Selection: Selection{Agent: "claude", Model: "opus", Effort: "high"},
		Repo:      repo, RepoName: "repo", Prompt: "do the task",
		Branch: branch, Base: "origin/feat/other",
	}
}

func wantCall(t *testing.T, calls, want string) {
	t.Helper()
	if !strings.Contains(calls, want) {
		t.Errorf("no call with %q in:\n%s", want, calls)
	}
}

func wantNoCall(t *testing.T, calls, unwanted string) {
	t.Helper()
	if strings.Contains(calls, unwanted) {
		t.Errorf("unexpected call with %q in:\n%s", unwanted, calls)
	}
}

func TestHeldBranchOpensItsWorktree(t *testing.T) {
	calls := useFakeHerdr(t)
	repo := gitRepo(t)
	if err := os.WriteFile(filepath.Join(repo, ".lerd.yaml"), nil, 0o600); err != nil {
		t.Fatal(err)
	}

	if _, _, err := launch(testSpec(repo, "held")); err != nil {
		t.Fatal(err)
	}

	got := calls()
	wantCall(t, got, "worktree open --cwd "+repo+" --branch held --no-focus")
	wantNoCall(t, got, "worktree create")
	wantCall(t, got, "--pane w1:p1")
	wantCall(t, got, "agent prompt held do the task")
	wantNoCall(t, got, "pane run") // lerd set up this worktree when it was made
	if base := runGit(t, repo, "config", "branch.held.gh-merge-base"); base != "feat/original" {
		t.Errorf("gh-merge-base = %q", base)
	}
}

func TestHeldBranchWithBusyPaneUsesNewPane(t *testing.T) {
	calls := useFakeHerdr(t)
	t.Setenv("FAKE_ALREADY_OPEN", "true")
	t.Setenv("FAKE_ROOT_BUSY", "1")

	if _, _, err := launch(testSpec(gitRepo(t), "held")); err != nil {
		t.Fatal(err)
	}

	got := calls()
	wantCall(t, got, "pane split w1:p1 --direction right --cwd /held --no-focus")
	wantCall(t, got, "--pane w1:p2")
	wantCall(t, got, "agent prompt held do the task")
}

func TestFreeExistingBranchKeepsItsBase(t *testing.T) {
	calls := useFakeHerdr(t)
	repo := gitRepo(t)

	if _, _, err := launch(testSpec(repo, "free")); err != nil {
		t.Fatal(err)
	}

	wantCall(t, calls(), "worktree create --cwd "+repo+" --branch free")
	if base := runGit(t, repo, "config", "branch.free.gh-merge-base"); base != "feat/original" {
		t.Errorf("gh-merge-base = %q", base)
	}
}

func TestNewBranchRecordsItsBase(t *testing.T) {
	calls := useFakeHerdr(t)
	repo := gitRepo(t)

	if _, _, err := launch(testSpec(repo, "feat/new")); err != nil {
		t.Fatal(err)
	}

	wantCall(t, calls(), "worktree create --cwd "+repo+" --branch feat/new")
	if base := runGit(t, repo, "config", "branch.feat/new.gh-merge-base"); base != "origin/feat/other" {
		t.Errorf("gh-merge-base = %q", base)
	}
}

// Herdr keeps the first 240 characters of the body, and a Git error can be longer.
func TestFailureNotificationKeepsDraftHint(t *testing.T) {
	calls := useFakeHerdr(t)
	t.Setenv("FAKE_CREATE_ERROR", "fatal: "+strings.Repeat("long git error ", 30))
	specPath := filepath.Join(t.TempDir(), "spec.json")
	if err := writeJSON(specPath, testSpec(gitRepo(t), "feat/new")); err != nil {
		t.Fatal(err)
	}

	if err := runJob(specPath); err == nil {
		t.Fatal("no error from the job")
	}

	_, body, ok := strings.Cut(calls(), "--body ")
	if !ok {
		t.Fatal("no notification body")
	}
	if !strings.Contains(body[:240], "saved as a draft") {
		t.Errorf("the hint is not in the first 240 characters:\n%s", body[:240])
	}
}

const randomBranch = "worktree/lucky-harbor-bae4"

// useRandomWorktree makes the checkout that the fake `worktree create` reports,
// and sets the naming command. It returns the path of the checkout.
func useRandomWorktree(t *testing.T, repo, naming string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "worktree-lucky-harbor-bae4")
	runGit(t, repo, "worktree", "add", "-q", "-b", randomBranch, path)
	t.Setenv("FAKE_RANDOM_PATH", path)
	config := fmt.Sprintf("naming_command = [\"sh\", \"-c\", %q]\n", naming)
	dir := os.Getenv("HERDR_PLUGIN_CONFIG_DIR")
	if err := os.WriteFile(filepath.Join(dir, "config.toml"), []byte(config), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func wantBefore(t *testing.T, calls, first, second string) {
	t.Helper()
	i, j := strings.Index(calls, first), strings.Index(calls, second)
	if i < 0 || j < 0 || i > j {
		t.Errorf("%q must come before %q in:\n%s", first, second, calls)
	}
}

func TestAutoNameRenamesAfterAgentHasPrompt(t *testing.T) {
	calls := useFakeHerdr(t)
	repo := gitRepo(t)
	path := useRandomWorktree(t, repo, "cat >/dev/null; sleep 1; echo feat/good-name")

	name, branch, err := launch(testSpec(repo, ""))
	if err != nil {
		t.Fatal(err)
	}

	got := calls()
	wantCall(t, got, "worktree create --cwd "+repo+" --base origin/feat/other --no-focus")
	wantCall(t, got, "agent start lucky-harbor-bae4")
	wantBefore(t, got, "agent prompt lucky-harbor-bae4 do the task", "workspace rename w2 good-name")
	wantCall(t, got, "agent rename lucky-harbor-bae4 good-name")
	if name != "good-name" || branch != "feat/good-name" {
		t.Errorf("name = %q, branch = %q", name, branch)
	}
	if current := runGit(t, path, "branch", "--show-current"); current != "feat/good-name" {
		t.Errorf("branch in the checkout = %q", current)
	}
	if base := runGit(t, repo, "config", "branch.feat/good-name.gh-merge-base"); base != "origin/feat/other" {
		t.Errorf("gh-merge-base = %q", base)
	}
}

func TestAutoNameRenamesBeforeLerdSetup(t *testing.T) {
	calls := useFakeHerdr(t)
	repo := gitRepo(t)
	useRandomWorktree(t, repo, "cat >/dev/null; echo fix/good-name")
	if err := os.WriteFile(filepath.Join(repo, ".lerd.yaml"), nil, 0o600); err != nil {
		t.Fatal(err)
	}

	name, branch, err := launch(testSpec(repo, ""))
	if err != nil {
		t.Fatal(err)
	}

	got := calls()
	wantBefore(t, got, "workspace rename w2 good-name", "pane run w2:p1")
	wantCall(t, got, "agent start good-name")
	wantNoCall(t, got, "agent rename")
	if name != "good-name" || branch != "fix/good-name" {
		t.Errorf("name = %q, branch = %q", name, branch)
	}
}

func TestAutoNameFallsBackToPromptSlug(t *testing.T) {
	useFakeHerdr(t)
	repo := gitRepo(t)
	useRandomWorktree(t, repo, "cat >/dev/null; exit 1")

	_, branch, err := launch(testSpec(repo, ""))
	if err != nil {
		t.Fatal(err)
	}
	if branch != "feat/do-the-task" {
		t.Errorf("branch = %q", branch)
	}
}

func TestRenameBranchAddsSuffixToTakenName(t *testing.T) {
	useFakeHerdr(t)
	repo := gitRepo(t)
	path := useRandomWorktree(t, repo, "")
	runGit(t, repo, "branch", "feat/good-name")

	var wt openedWorktree
	wt.Worktree.Path = path
	if got := renameBranch(testSpec(repo, ""), wt, randomBranch, "feat/good-name"); got != "feat/good-name-2" {
		t.Errorf("branch = %q", got)
	}
}

func TestRenameBranchKeepsNameWhenBlocked(t *testing.T) {
	cases := map[string]func(t *testing.T, repo, path string){
		"agent moved to another branch": func(t *testing.T, repo, path string) {
			runGit(t, path, "switch", "-q", "-c", "feat/agent-choice")
		},
		"branch has an upstream": func(t *testing.T, repo, path string) {
			runGit(t, repo, "config", "branch."+randomBranch+".remote", "origin")
		},
		"branch is on origin": func(t *testing.T, repo, path string) {
			runGit(t, repo, "update-ref", "refs/remotes/origin/"+randomBranch, "HEAD")
		},
	}
	for name, block := range cases {
		t.Run(name, func(t *testing.T) {
			useFakeHerdr(t)
			repo := gitRepo(t)
			path := useRandomWorktree(t, repo, "")
			block(t, repo, path)

			var wt openedWorktree
			wt.Worktree.Path = path
			if got := renameBranch(testSpec(repo, ""), wt, randomBranch, "feat/good-name"); got != randomBranch {
				t.Errorf("branch = %q", got)
			}
			if out := runGit(t, repo, "branch", "--list", "feat/good-name"); out != "" {
				t.Errorf("branch was renamed: %q", out)
			}
		})
	}
}
