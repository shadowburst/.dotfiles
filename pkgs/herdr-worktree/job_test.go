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
printf '%s\n' "$*" >> "$FAKE_HERDR_LOG"
case "$1 $2" in
"worktree open")
	if [ -n "$FAKE_OPEN_ERROR" ]; then
		printf '{"error":{"code":"worktree_open_failed","message":"%s"}}' "$FAKE_OPEN_ERROR" >&2
		exit 1
	fi
	case "$*" in
	*"--cwd "*) ;;
	*)
		echo '{"error":{"code":"worktree_not_found","message":"worktree path not found"}}' >&2
		exit 1
		;;
	esac
	path=$(printf '%s' "$*" | sed -n 's/.*--path \([^ ]*\).*/\1/p')
	echo "{\"result\":{\"already_open\":${FAKE_ALREADY_OPEN:-false},\"root_pane\":{\"pane_id\":\"w1:p1\"},\"workspace\":{\"workspace_id\":\"w1\"},\"worktree\":{\"path\":\"$path\"}}}"
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

// fakeWt makes the worktree with git, like `wt switch`, and fails after it when
// FAKE_WT_FAIL is set, like a failing hook.
const fakeWt = `#!/bin/sh
printf '%s\n' "$*" >> "$FAKE_WT_LOG"
repo=$2
shift 3
create= branch= base=
while [ $# -gt 0 ]; do
	case $1 in
	--create) create=1 branch=$2; shift ;;
	--base) base=$2; shift ;;
	--*) ;;
	*) branch=$1 ;;
	esac
	shift
done
path="$FAKE_WT_DIR/$(printf '%s' "$branch" | tr / -)"
if [ -n "$create" ]; then
	git -C "$repo" worktree add -q -b "$branch" "$path" "$base" >&2 || exit 1
else
	git -C "$repo" worktree add -q "$path" "$branch" >&2 || exit 1
fi
echo "running pre-start hook" >&2
if [ -n "$FAKE_WT_FAIL" ]; then
	echo "hook failed: $FAKE_WT_FAIL" >&2
	exit 1
fi
printf '{"action":"created","branch":"%s","path":"%s"}\n' "$branch" "$path"
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

type fakes struct {
	herdr, wt func() string
}

func readLog(t *testing.T, path string) func() string {
	return func() string {
		raw, err := os.ReadFile(path)
		if err != nil && !os.IsNotExist(err) {
			t.Fatal(err)
		}
		return string(raw)
	}
}

// useFakes puts the fake herdr and wt in place.
func useFakes(t *testing.T) fakes {
	t.Helper()
	dir := t.TempDir()
	for name, body := range map[string]string{"herdr": fakeHerdr, "wt": fakeWt} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0o700); err != nil {
			t.Fatal(err)
		}
	}
	t.Setenv("HERDR_BIN_PATH", filepath.Join(dir, "herdr"))
	t.Setenv("HERDR_WORKTREE_WT", filepath.Join(dir, "wt"))
	t.Setenv("FAKE_HERDR_LOG", filepath.Join(dir, "herdr.log"))
	t.Setenv("FAKE_WT_LOG", filepath.Join(dir, "wt.log"))
	t.Setenv("FAKE_WT_DIR", t.TempDir())
	for _, name := range []string{"FAKE_OPEN_ERROR", "FAKE_ALREADY_OPEN", "FAKE_ROOT_BUSY", "FAKE_WT_FAIL"} {
		t.Setenv(name, "")
	}
	t.Setenv("HERDR_PLUGIN_STATE_DIR", t.TempDir())
	t.Setenv("HERDR_PLUGIN_CONFIG_DIR", t.TempDir())
	return fakes{readLog(t, filepath.Join(dir, "herdr.log")), readLog(t, filepath.Join(dir, "wt.log"))}
}

func useNaming(t *testing.T, script string) {
	t.Helper()
	config := fmt.Sprintf("naming_command = [\"sh\", \"-c\", %q]\n", script)
	if err := os.WriteFile(filepath.Join(os.Getenv("HERDR_PLUGIN_CONFIG_DIR"), "config.toml"), []byte(config), 0o600); err != nil {
		t.Fatal(err)
	}
}

func testSpec(repo, branch string) JobSpec {
	return JobSpec{
		Selection: Selection{Agent: "claude", Model: "opus", Effort: "high"},
		Repo:      repo, RepoName: "repo", Prompt: "do the task",
		Branch: branch, Base: "main",
	}
}

func testLaunch(t *testing.T, spec JobSpec) (string, string, error) {
	t.Helper()
	return launch(spec, filepath.Join(t.TempDir(), "wt.log"))
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
	f := useFakes(t)
	repo := gitRepo(t)

	if _, _, err := testLaunch(t, testSpec(repo, "held")); err != nil {
		t.Fatal(err)
	}

	got := f.herdr()
	wantCall(t, got, "worktree open --cwd "+repo+" --path "+filepath.Join(filepath.Dir(repo), "holder")+" --no-focus")
	wantCall(t, got, "--pane w1:p1")
	wantCall(t, got, "agent prompt held do the task")
	wantNoCall(t, got, "pane run")
	if calls := f.wt(); calls != "" {
		t.Errorf("wt ran: %s", calls)
	}
}

func TestHeldBranchWithBusyPaneUsesNewPane(t *testing.T) {
	f := useFakes(t)
	t.Setenv("FAKE_ALREADY_OPEN", "true")
	t.Setenv("FAKE_ROOT_BUSY", "1")

	if _, _, err := testLaunch(t, testSpec(gitRepo(t), "held")); err != nil {
		t.Fatal(err)
	}

	got := f.herdr()
	wantCall(t, got, "pane split w1:p1 --direction right --cwd ")
	wantCall(t, got, "--pane w1:p2")
}

func TestFreeExistingBranchKeepsItsBase(t *testing.T) {
	f := useFakes(t)
	repo := gitRepo(t)

	if _, _, err := testLaunch(t, testSpec(repo, "free")); err != nil {
		t.Fatal(err)
	}

	wantCall(t, f.wt(), "-C "+repo+" switch free --no-cd --yes --format=json")
	if base := runGit(t, repo, "config", "branch.free.gh-merge-base"); base != "feat/original" {
		t.Errorf("gh-merge-base = %q", base)
	}
}

func TestNewBranchShowsLogThenStartsAgent(t *testing.T) {
	f := useFakes(t)
	repo := gitRepo(t)

	if _, _, err := testLaunch(t, testSpec(repo, "feat/new")); err != nil {
		t.Fatal(err)
	}

	wantCall(t, f.wt(), "-C "+repo+" switch --create feat/new --base main --no-cd --yes --format=json")
	got := f.herdr()
	wantCall(t, got, "worktree open --cwd "+repo+" --path "+filepath.Join(os.Getenv("FAKE_WT_DIR"), "feat-new")+" --label new --no-focus")
	wantCall(t, got, "pane run w1:p1 clear; tail -n +1 -F --pid=")
	wantCall(t, got, "agent start new --kind claude --pane w1:p1")
	if base := runGit(t, repo, "config", "branch.feat/new.gh-merge-base"); base != "main" {
		t.Errorf("gh-merge-base = %q", base)
	}
}

func TestShellJobFocusesAndStartsNoAgent(t *testing.T) {
	f := useFakes(t)
	spec := testSpec(gitRepo(t), "free")
	spec.Prompt, spec.Focus = "", true

	if _, _, err := testLaunch(t, spec); err != nil {
		t.Fatal(err)
	}

	got := f.herdr()
	wantCall(t, got, "--label free --focus")
	wantNoCall(t, got, "agent start")
}

func TestWtFailureNotifiesWithItsOutput(t *testing.T) {
	f := useFakes(t)
	t.Setenv("FAKE_WT_FAIL", "boom")
	specPath := filepath.Join(os.Getenv("HERDR_PLUGIN_STATE_DIR"), "jobs", "1.json")
	if err := writeJSON(specPath, testSpec(gitRepo(t), "feat/new")); err != nil {
		t.Fatal(err)
	}

	if err := runJob(specPath); err == nil {
		t.Fatal("no error from the job")
	}

	got := f.herdr()
	wantCall(t, got, "notification show Worktree failed: wt switch")
	wantCall(t, got, "hook failed: boom")
	wantNoCall(t, got, "agent start")
	if d, ok := loadDraft(); !ok || d.Prompt != "do the task" {
		t.Errorf("draft = %+v, %v", d, ok)
	}
}

// Herdr keeps the first 240 characters of the body, and an error can be longer.
func TestFailureNotificationKeepsDraftHint(t *testing.T) {
	f := useFakes(t)
	t.Setenv("FAKE_OPEN_ERROR", "fatal: "+strings.Repeat("long error ", 30))
	specPath := filepath.Join(os.Getenv("HERDR_PLUGIN_STATE_DIR"), "jobs", "1.json")
	if err := writeJSON(specPath, testSpec(gitRepo(t), "held")); err != nil {
		t.Fatal(err)
	}

	if err := runJob(specPath); err == nil {
		t.Fatal("no error from the job")
	}

	_, body, ok := strings.Cut(f.herdr(), "--body ")
	if !ok {
		t.Fatal("no notification body")
	}
	if !strings.Contains(body[:240], "saved as a draft") {
		t.Errorf("the hint is not in the first 240 characters:\n%s", body[:240])
	}
}

func TestAutoNameComesBeforeTheWorktree(t *testing.T) {
	f := useFakes(t)
	useNaming(t, "cat >/dev/null; echo feat/good-name")

	_, branch, err := testLaunch(t, testSpec(gitRepo(t), ""))
	if err != nil {
		t.Fatal(err)
	}

	if branch != "feat/good-name" {
		t.Errorf("branch = %q", branch)
	}
	wantCall(t, f.wt(), "switch --create feat/good-name --base main")
	wantCall(t, f.herdr(), "agent start good-name")
}

func TestAutoNameFallsBackToPromptSlug(t *testing.T) {
	f := useFakes(t)
	useNaming(t, "exit 1")

	if _, _, err := testLaunch(t, testSpec(gitRepo(t), "")); err != nil {
		t.Fatal(err)
	}

	wantCall(t, f.wt(), "switch --create feat/do-the-task --base main")
}

func TestAutoNameAddsSuffixToTakenName(t *testing.T) {
	f := useFakes(t)
	repo := gitRepo(t)
	runGit(t, repo, "branch", "feat/taken")
	useNaming(t, "echo feat/taken")

	if _, _, err := testLaunch(t, testSpec(repo, "")); err != nil {
		t.Fatal(err)
	}

	wantCall(t, f.wt(), "switch --create feat/taken-2 --base main")
}
