#!/usr/bin/env bash
# Read-only integration checks: all GitHub, act, Docker, and git calls are fake.
set -euo pipefail
script="$(dirname "$0")/local-ci-report.sh"
for tool in jq flock timeout; do command -v "$tool" >/dev/null || { echo "missing test dependency: $tool" >&2; exit 1; }; done
root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT
mkdir "$root/bin" "$root/locks"
export TEST_ROOT="$root" TMPDIR="$root/locks" PATH="$root/bin:$PATH"
cat >"$root/bin/gh" <<'EOF'
#!/usr/bin/env bash
case "$*" in
  'api repos/Example/project/pulls/7')
    [[ ! ${TEST_LOOKUP_TIMEOUT:-} ]] || exit 124
    count=0; [[ ! -f $TEST_ROOT/heads ]] || read -r count <"$TEST_ROOT/heads"
    printf '%s\n' "$((count + 1))" >"$TEST_ROOT/heads"
    sha=$(printf 'a%.0s' {1..40})
    [[ ! ${TEST_MOVED:-} || $count -lt 1 ]] || sha=$(printf 'b%.0s' {1..40})
    name=Example/project; [[ ${TEST_FORK:-} ]] && name=outsider/project
    jq -n --arg sha "$sha" --arg name "$name" '{head:{sha:$sha,repo:{full_name:$name}},user:{login:"member"}}' ;;
  'api repos/Example/project') echo '{"owner":{"type":"Organization"}}' ;;
  'api user/orgs --paginate --jq .[].login') echo Example ;;
  'api orgs/Example/members/member --silent') [[ ! ${TEST_NONMEMBER:-} ]] ;;
  'repo clone '* )
    mkdir -p "$4/.github/workflows"
    [[ ${TEST_NO_WORKFLOW:-} ]] || printf 'name: local\njobs: {}\n' >"$4/.github/workflows/local-tests.yaml" ;;
  'pr checkout '* ) : ;;
  'api user --jq .login') echo reviewer ;;
  'api repos/Example/project/issues/7/comments?per_page=100 --paginate --slurp')
    if [[ ${TEST_NO_OWN:-} ]]; then echo '[[{"id":11,"body":"<!-- local-ci-report -->","user":{"login":"stranger"}}]]'
    else echo '[[{"id":11,"body":"<!-- local-ci-report -->","user":{"login":"stranger"}},{"id":12,"body":"<!-- local-ci-report -->","user":{"login":"reviewer"}}]]'; fi ;;
  'api -X PATCH repos/Example/project/issues/comments/12 --input -'|'api -X POST repos/Example/project/issues/7/comments --input -')
    jq . >"$TEST_ROOT/comment"; echo '{"html_url":"https://github.com/Example/project/pull/7#issuecomment-12"}' ;;
  'api -X POST repos/Example/project/statuses/'*' --input -') jq . >"$TEST_ROOT/status"; echo '{}' ;;
  *) printf 'unexpected gh: %s\n' "$*" >&2; exit 1 ;;
esac
EOF
cat >"$root/bin/git" <<'EOF'
#!/usr/bin/env bash
printf 'a%.0s' {1..40}; echo
EOF
cat >"$root/bin/act" <<'EOF'
#!/usr/bin/env bash
[[ ! ${GH_TOKEN:-} && ! ${DATABASE_URL:-} ]] || exit 9
if [[ -f $(dirname "$0")/../secrets ]]; then
  [[ $* != *'--secret GITHUB_TOKEN='* ]] || exit 9
else
  [[ $* == *'--secret GITHUB_TOKEN='* ]] || exit 9
fi
mode=pass
[[ ! -f $(dirname "$0")/../mode ]] || read -r mode <"$(dirname "$0")/../mode"
if [[ " $* " == *' -l '* ]]; then
  [[ $mode != triggered ]] || { echo '0 test pull_request other.yaml'; exit; }
  echo '0 test local-tests.yaml'; exit
fi
[[ " $* " == *' --env LOCAL_CI_RUN_ID=local-ci-'* ]] || exit 9
[[ " $* " != *' --env DB_PORT='* ]] || exit 9
case $mode in
  timeout) exit 124 ;;
  unsafe) echo '{"jobID":"test","stepResult":"failure","step":"<bad|*_[`","msg":"failed"}'; exit 1 ;;
  pass) echo '{"jobID":"test","jobResult":"success"}' ;;
  skipped) echo '{"jobID":"test","jobResult":"skipped"}' ;;
  fail) echo '{"jobID":"test","stepResult":"failure","step":"Run","msg":"failed"}'; exit 1 ;;
  error) exit 1 ;;
  hang) sleep 10 ;;
esac
EOF
cat >"$root/bin/docker" <<'EOF'
#!/usr/bin/env bash
case $1 in
  info) [[ ! ${TEST_NO_DOCKER:-} ]] ;;
  ps)
    [[ " $* " == *' --filter label=local-ci-run=local-ci-'* ]] || exit 9
    [[ ! ${TEST_PS_FAIL:-} ]] || exit 1
    [[ ! ${TEST_OWNED:-} || -f $TEST_ROOT/removed ]] || echo owned-container ;;
  rm)
    [[ $* == 'rm -f -- owned-container' ]] || exit 9
    [[ ! ${TEST_RM_FAIL:-} ]] || exit 1
    touch "$TEST_ROOT/removed" ;;
  *) exit 9 ;;
esac
EOF
chmod +x "$root/bin/"*
url=https://github.com/Example/project/pull/7
check() {
    local expected=$1; shift
    rm -f "$root/heads" "$root/comment" "$root/status" "$root/removed"
    local actual=0
    bash "$script" "$url" "$@" >"$root/out" 2>"$root/err" || actual=$?
    if ((actual != expected)); then printf 'expected %s got %s\n' "$expected" "$actual"; grep . "$root/out" "$root/err"; exit 1; fi
}
check 0
grep -q 'Local checks passed' "$root/out"
! grep -Eq 'PR: |Local `act` result' "$root/out"
[[ ! -e $root/comment && ! -e $root/status ]]
check 0 --submit
jq -e '.body | contains("Local checks passed") and contains("<!-- local-ci-report -->")' "$root/comment" >/dev/null
TEST_NO_OWN=1 check 0 --submit
jq -e '.body | contains("Local checks passed")' "$root/comment" >/dev/null
jq -e '.state == "success" and .target_url == "https://github.com/Example/project/pull/7#issuecomment-12"' "$root/status" >/dev/null
echo fail >"$root/mode"
check 1 --submit
grep -q 'Job test, step Run' "$root/out"
jq -e '.state == "failure"' "$root/status" >/dev/null
echo unsafe >"$root/mode"
check 1
! grep -q '<bad' "$root/out"
echo error >"$root/mode"
check 3
echo skipped >"$root/mode"
check 2
echo triggered >"$root/mode"
check 2
grep -q 'No local-only jobs' "$root/out"
echo timeout >"$root/mode"
TEST_OWNED=1 check 4
[[ -e $root/removed ]]
echo pass >"$root/mode"
TEST_OWNED=1 check 0
[[ -e $root/removed ]]
TEST_OWNED=1 TEST_RM_FAIL=1 check 3
grep -q 'could not be removed' "$root/out"
grep -q 'Run-owned Docker containers remain' "$root/err"
TEST_PS_FAIL=1 check 3
grep -q 'could not be removed' "$root/out"
TEST_MOVED=1 check 5 --submit
grep -q 'not current' "$root/out"
[[ ! -e $root/status ]]
TEST_NO_WORKFLOW=1 check 2
grep -Fq 'No `local-*.yaml` workflows configured.' "$root/out"
! grep -q '| Workflow |' "$root/out"
TEST_FORK=1 check 2
grep -q 'Fork heads are not trusted' "$root/out"
! grep -q '| Workflow |' "$root/out"
! grep -q 'workflows configured' "$root/out"
TEST_NONMEMBER=1 check 2
grep -q 'could not be verified' "$root/out"
GH_TOKEN=private DATABASE_URL=private check 0
TEST_NO_DOCKER=1 check 3
[[ ! -e $root/heads ]] && grep -q 'Docker daemon is unavailable' "$root/err"
TEST_LOOKUP_TIMEOUT=1 check 4
grep -q 'GitHub lookup or checkout timed out' "$root/out"
printf 'unchanged\n' >"$root/victim"
lockdir="$TMPDIR/local-ci-$(id -u)"
rm "$lockdir/lock"
ln -s "$root/victim" "$lockdir/lock"
check 3
grep -q 'Unsafe local CI lock file' "$root/out"
grep -qx unchanged "$root/victim"
rm "$lockdir/lock"
printf 'GITHUB_TOKEN=explicit\n' >"$root/secrets"
check 0 --secret-file "$root/secrets"
actual=0
bash "$script" --timeout 0 "$url" >/dev/null 2>&1 || actual=$?
((actual == 2)) || { echo 'invalid timeout accepted'; exit 1; }
echo 'local CI Bash checks passed'
