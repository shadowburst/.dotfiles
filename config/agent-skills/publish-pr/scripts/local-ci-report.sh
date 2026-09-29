#!/usr/bin/env bash
# Run explicitly opted-in GitHub Actions locally; print and optionally post a PR report.
# Linux, Bash 4+, jq, flock, timeout (GNU coreutils), gh, act, git, Docker required.
set -uo pipefail

PASS=0 FAIL=1 NOT_RUN=2 ERROR=3 TIMEOUT=4 STALE=5
labels=('Local checks passed' 'Local checks failed' 'Not run' 'Runner error' 'Timed out' 'Stale PR head')
icons=('✅' '❌' '⚪' '⚠️' '⏱️' '🔄')
marker_start='<!-- local-ci-report:start -->'
marker_end='<!-- local-ci-report:end -->'
context='local-ci/report'

safe() { printf '%s' "$1" | LC_ALL=C tr '\000-\037\177`*_[]<>|' ' ' | cut -c1-160; }
names=() jobs=() states=() details=() durations=() steps=() excerpts=() secret_values=()
excerpt_safe=1
add() {
    names+=("$1"); jobs+=("$2"); states+=("$3"); details+=("$4")
    durations+=("${5:-}"); steps+=("${6:-}"); excerpts+=("${7:-}")
}
failed_step() {
    jq -Rr --arg job "$2" 'fromjson? | select(type == "object" and .jobID == $job and .stepResult == "failure") | .step // empty' "$1" | tail -1
}
failure_excerpt() {
    local secrets
    ((excerpt_safe)) || return 0
    secrets=$(jq -cn --args '$ARGS.positional' -- "${secret_values[@]}") || return 1
    jq -Rsr --arg job "$2" --arg step "$3" --argjson secrets "$secrets" '
        [split("\n")[] | fromjson?
            | select(type == "object" and .jobID == $job and .step == $step)
            | .msg? | select(type == "string") | . as $msg
            | reduce $secrets[] as $secret ($msg;
                if $secret == "" then . else split($secret) | join("[REDACTED]") end)
            | gsub("[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]"; "")
            | gsub("`"; "’") | split("\n")[]]
        | .[-20:] | join("\n") | . as $text
        | if ($text | utf8bytelength) > 4096 then
            "…\n" + ($text[-4092:] | until(utf8bytelength <= 4092; . = .[1:]))
          else . end
    ' "$1"
}
report() {
    printf '## Local CI\n%s **%s**\n' "${icons[code]}" "${labels[code]}"
    [[ ! $sha ]] || printf 'Tested head: `%s`\n' "$sha"
    [[ ! ${runner:-} ]] || printf 'Run by @%s at `%s`.\n' "$runner" "$published_at"
    if ((${#names[@]})); then
        printf '\n'
        local i duration
        for i in "${!names[@]}"; do
            duration=''
            [[ ! ${durations[i]} ]] || duration=" — ${durations[i]}s"
            printf '<details>\n<summary>%s <strong>%s</strong>%s</summary>\n\n' "${icons[${states[i]}]}" "$(safe "${jobs[i]}")" "$duration"
            printf 'Workflow: `%s`\n\n' "$(safe "${names[i]}")"
            if [[ ${states[i]} == "$FAIL" ]]; then
                [[ ! ${steps[i]} ]] || printf '**Failure in step:** `%s`\n\n' "$(safe "${steps[i]}")"
                if [[ ${excerpts[i]} ]]; then printf '```text\n%s\n```\n\n' "${excerpts[i]}"; fi
                printf 'Rerun the local-CI report for full diagnostics.\n'
            else
                printf '%s\n' "$(safe "${details[i]}")"
            fi
            printf '\n</details>\n\n'
        done
    elif [[ ! $note ]] && ((code == NOT_RUN)); then
        printf '\nNo `local-*.yaml` workflows configured.\n'
    fi
    [[ ! $note ]] || printf '\n⚠️ %s\n' "$(safe "$note")"
}
self_test() {
    local log output step excerpt
    log=$(mktemp) || return 1
    : >"$log"
    local i
    for i in {1..25}; do
        printf '{"jobID":"test","step":"Run tests","msg":"line %s"}\n' "$i" >>"$log"
    done
    printf '%s\n' \
        '{"jobID":"test","step":"Run tests","msg":"expected `2`, token secret-value"}' \
        '{"jobID":"test","step":"Run tests","stepResult":"failure","msg":"exit code 1"}' >>"$log"
    secret_values=('secret-value')
    step=$(failed_step "$log" test)
    excerpt=$(failure_excerpt "$log" test "$step")
    rm -f -- "$log"
    [[ $step == 'Run tests' && $excerpt == *'[REDACTED]'* && $excerpt != *'secret-value'* && $excerpt != *'`'* ]] || return 1
    [[ $(wc -l <<<"$excerpt") -le 20 && $(printf '%s' "$excerpt" | wc -c) -le 4096 && $excerpt != *'line 7'* ]] || return 1
    names=(); jobs=(); states=(); details=(); durations=(); steps=(); excerpts=()
    sha=abc123 code=$FAIL note=''
    add local-ci.yaml test "$FAIL" '' 34 "$step" "$excerpt"
    output=$(report)
    [[ $output == *'<details>'* && $output == *'<summary>❌ <strong>test</strong> — 34s</summary>'* ]] || return 1
    [[ $output == *'```text'* && $output != *'| Workflow |'* ]] || return 1
}
if [[ ${1:-} == --self-test && $# == 1 ]]; then
    command -v jq >/dev/null || { echo 'Missing required command: jq' >&2; exit 3; }
    self_test || { echo 'Local CI report self-test failed' >&2; exit 1; }
    echo 'Local CI report self-test passed'
    exit 0
fi

usage() { printf 'Usage: %s [--timeout MINUTES] [--secret-file FILE] [--submit] https://github.com/OWNER/REPO/pull/NUMBER\n' "$0" >&2; exit 2; }
(( BASH_VERSINFO[0] >= 4 )) || { echo 'Bash 4+ required' >&2; exit 3; }
for tool in jq flock timeout gh act git docker mktemp stat realpath; do
    command -v "$tool" >/dev/null || { printf 'Missing required command: %s\n' "$tool" >&2; exit 3; }
done
timeout --version | grep -q 'GNU coreutils' || { echo 'GNU coreutils timeout required' >&2; exit 3; }
timeout 10 docker info >/dev/null 2>&1 || { echo 'Docker daemon is unavailable' >&2; exit 3; }
timeout_minutes=60 secret_file='' submit=0 url=''
while (($#)); do
    case $1 in
        --timeout) (($# >= 2)) || usage; timeout_minutes=$2; shift 2 ;;
        --secret-file) (($# >= 2)) || usage; secret_file=$2; shift 2 ;;
        --submit) submit=1; shift ;;
        --*) usage ;;
        *) [[ ! $url ]] || usage; url=$1; shift ;;
    esac
done
if [[ ! $timeout_minutes =~ ^[0-9]+$ ]] || ((timeout_minutes <= 0)); then usage; fi
[[ ! $secret_file || -f $secret_file ]] || usage
[[ $url =~ ^https://github\.com/([^/]+)/([^/]+)/pull/([0-9]+)([/?#].*)?$ ]] || usage
owner=${BASH_REMATCH[1]} repo=${BASH_REMATCH[2]} number=${BASH_REMATCH[3]}
url="https://github.com/$owner/$repo/pull/$number"
if [[ $secret_file ]]; then
    secret_file=$(realpath "$secret_file") || exit 3
    while IFS= read -r line || [[ $line ]]; do
        [[ $line =~ ^[[:space:]]*(#.*)?$ ]] && continue
        if [[ $line =~ ^[A-Za-z_][A-Za-z0-9_]*=([A-Za-z0-9_./:+@%=-]*)$ ]]; then
            [[ ! ${BASH_REMATCH[1]} ]] || secret_values+=("${BASH_REMATCH[1]}")
        else
            excerpt_safe=0
            break
        fi
    done <"$secret_file"
fi

tmp=$(mktemp -d -t local-ci-XXXXXXXX) || exit 3
run_id=${tmp##*/}
run_started=0
cleanup_owned() {
    local containers ids=()
    containers=$(timeout 10 docker ps -aq --filter "label=local-ci-run=$run_id") || return 1
    if [[ $containers ]]; then
        mapfile -t ids <<<"$containers"
        timeout 20 docker rm -f -- "${ids[@]}" >/dev/null 2>&1 || return 1
    fi
    containers=$(timeout 10 docker ps -aq --filter "label=local-ci-run=$run_id") || return 1
    [[ ! $containers ]]
}
trap 'if ((run_started)); then cleanup_owned || echo "⚠️ Run-owned Docker containers remain; inspect label local-ci-run=$run_id" >&2; fi; rm -rf -- "$tmp"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# /proc/uptime is monotonic; wall-clock changes must not extend the execution budget.
now() { local uptime rest; read -r uptime rest </proc/uptime; printf '%s' "${uptime%%.*}"; }
deadline=$(( $(now) + timeout_minutes * 60 ))
remaining() { local left=$(( deadline - $(now) )); ((left > 0)) && printf '%s' "$left" || printf 0; }
api() { timeout 45 gh "$@" 2>/dev/null; }
head() { local response; response=$(api api "repos/$owner/$repo/pulls/$number") || return $?; jq -er '.head.sha' <<<"$response"; }
fail() { code=$1 note=$2; }
github_error() {
    if (( $1 == 124 || $1 == 137 )); then fail "$TIMEOUT" 'GitHub operation timed out'
    else fail "$ERROR" "$2"; fi
}

# Bash arrays keep untrusted workflow names and messages out of shell syntax.
sha='' note='' code=$NOT_RUN

# Supply act with an allowlisted environment, independent of gh's credentials.
act_env=(PATH="$PATH" HOME="$tmp" XDG_CONFIG_HOME="$tmp/config")
for key in LANG LC_ALL DOCKER_HOST DOCKER_CERT_PATH DOCKER_TLS_VERIFY XDG_RUNTIME_DIR; do
    [[ ! ${!key+x} ]] || act_env+=("$key=${!key}")
done
act_options=(--env-file /dev/null --var-file /dev/null --input-file /dev/null --secret-file "${secret_file:-/dev/null}")
if [[ ! $secret_file ]] || ! grep -Eiq '^GITHUB_TOKEN[[:space:]]*=' "$secret_file"; then
    act_options+=(--secret 'GITHUB_TOKEN=')
fi

# GNU timeout terminates act's process group, then kills it after three seconds.
act_call() {
    local budget=$1; shift
    (cd "$tmp" && timeout --signal=TERM --kill-after=3 "${budget}s" env -i "${act_env[@]}" act "$@")
}
checkout=
run() {
    local pr repository repository_name organizations author membership actual branch workflow listing row job result log budget started state detail step excerpt lockdir fd info current git_common_dir git_mount
    pr=$(api api "repos/$owner/$repo/pulls/$number") || { github_error "$?" 'GitHub PR lookup failed'; return; }
    sha=$(jq -er '.head.sha' <<<"$pr") || { fail "$ERROR" 'GitHub PR lookup failed'; return; }
    repository=$(api api "repos/$owner/$repo") || { github_error "$?" 'Repository lookup failed'; return; }
    jq -e '.owner.type' >/dev/null <<<"$repository" || { fail "$ERROR" 'Repository lookup failed'; return; }
    if [[ $(jq -r '.owner.type' <<<"$repository") != Organization ]]; then fail "$NOT_RUN" 'Target is not an organization repository'; return; fi
    if [[ $(jq -r '.head.repo.full_name // ""' <<<"$pr" | tr '[:upper:]' '[:lower:]') != "$(printf '%s' "$owner/$repo" | tr '[:upper:]' '[:lower:]')" ]]; then
        fail "$NOT_RUN" 'Fork heads are not trusted for local Docker execution'; return
    fi
    organizations=$(api api user/orgs --paginate --jq '.[].login') || { github_error "$?" 'Organization lookup failed'; return; }
    if ! grep -Fxiq -- "$owner" <<<"$organizations"; then fail "$NOT_RUN" 'Target is not in your GitHub organizations'; return; fi
    author=$(jq -er '.user.login' <<<"$pr") || { fail "$ERROR" 'PR author lookup failed'; return; }
    api api "orgs/$owner/members/$author" --silent >/dev/null
    membership=$?
    if ((membership == 124 || membership == 137)); then fail "$TIMEOUT" 'GitHub operation timed out'; return; fi
    if ((membership)); then fail "$NOT_RUN" 'PR author could not be verified as an organization member'; return; fi

    checkout=$(git rev-parse --show-toplevel 2>/dev/null) || { fail "$ERROR" 'Run local CI from the PR checkout'; return; }
    repository_name=$(cd "$checkout" && api repo view --json nameWithOwner --jq .nameWithOwner) || { github_error "$?" 'Could not verify checkout repository'; return; }
    if [[ ${repository_name,,} != "${owner,,}/${repo,,}" ]]; then fail "$ERROR" 'Current checkout belongs to another repository'; return; fi
    branch=$(git -C "$checkout" symbolic-ref --quiet --short HEAD) || { fail "$ERROR" 'Current checkout is detached'; return; }
    if [[ $branch != "$(jq -r '.head.ref' <<<"$pr")" ]]; then fail "$ERROR" 'Current checkout is not the PR branch'; return; fi
    if [[ $(git -C "$checkout" status --porcelain) ]]; then fail "$ERROR" 'Current checkout has uncommitted changes'; return; fi
    if [[ -f $checkout/.git ]]; then
        git_common_dir=$(cd "$checkout" && realpath "$(git rev-parse --git-common-dir)") || { fail "$ERROR" 'Could not resolve worktree Git metadata'; return; }
        printf -v git_mount '%q' "$git_common_dir:$git_common_dir:ro"
        act_options+=(--container-options "--volume $git_mount")
    fi

    budget=$(remaining)
    if ((budget == 0)); then fail "$TIMEOUT" 'GitHub lookup or pull timed out'; return; fi
    (cd "$checkout" && timeout "${budget}s" git pull --ff-only)
    result=$?
    if ((result)); then
        if ((result == 124 || result == 137)); then fail "$TIMEOUT" 'GitHub lookup or pull timed out'
        else fail "$ERROR" 'Current checkout could not be fast-forwarded'; fi
        return
    fi
    actual=$(git -C "$checkout" rev-parse HEAD) || { fail "$ERROR" 'Could not verify checkout'; return; }
    current=$(head) || { github_error "$?" 'Could not recheck PR head'; return; }
    if [[ $actual != "$current" ]]; then fail "$STALE" 'Current checkout does not match the PR head'; return; fi
    sha=$current
    shopt -s nullglob
    local workflows=("$checkout"/.github/workflows/local-*.yaml)
    shopt -u nullglob
    if ((${#workflows[@]})); then
        lockdir="${TMPDIR:-/tmp}/local-ci-$(id -u)"
        if ! mkdir -m 700 "$lockdir" 2>/dev/null; then
            info=$(stat -c '%u %a %F' -- "$lockdir" 2>/dev/null) || { fail "$ERROR" 'Unsafe local CI lock directory'; return; }
            [[ ! -L $lockdir && $info == "$(id -u) 700 directory" ]] || { fail "$ERROR" 'Unsafe local CI lock directory'; return; }
        fi
        [[ ! -L $lockdir/lock ]] || { fail "$ERROR" 'Unsafe local CI lock file'; return; }
        exec {fd}>>"$lockdir/lock" || { fail "$ERROR" 'Cannot open local CI lock'; return; }
        info=$(stat -Lc '%u %F' -- "/proc/self/fd/$fd")
        [[ $info == "$(id -u) regular file" || $info == "$(id -u) regular empty file" ]] || { fail "$ERROR" 'Unsafe local CI lock file'; return; }
        until flock -n "$fd"; do
            if (( $(remaining) == 0 )); then fail "$TIMEOUT" 'Timed out waiting for another local CI run'; return; fi
            sleep .25
        done
        for workflow in "${workflows[@]}"; do
            budget=$(remaining)
            if ((budget == 0)); then add "${workflow##*/}" '—' "$TIMEOUT" 'Not reached within time limit'; continue; fi
            listing=$(act_call "$(( budget < 30 ? budget : 30 ))" -l -C "$checkout" -W "$workflow" "${act_options[@]}" --json 2>/dev/null) || {
                add "${workflow##*/}" '—' "$ERROR" 'Runner could not inspect workflow: act failed'; continue;
            }
            local plan=() triggered=0
            while IFS= read -r row; do
                [[ $row =~ ^[0-9]+[[:space:]] ]] || continue
                read -ra fields <<<"$row"
                if ((${#fields[@]} < 2)); then triggered=2; break; fi
                [[ ${fields[${#fields[@]}-1]} == "${workflow##*/}" ]] || { triggered=1; break; }
                plan+=("${fields[1]}")
            done <<<"$listing"
            if ((triggered == 2)); then add "${workflow##*/}" '—' "$ERROR" 'Malformed act job listing'; continue; fi
            if ((triggered || ${#plan[@]} == 0)); then add "${workflow##*/}" '—' "$NOT_RUN" 'No local-only jobs in workflow'; continue; fi
            for job in "${plan[@]}"; do
                budget=$(remaining)
                if ((budget == 0)); then add "${workflow##*/}" "$job" "$TIMEOUT" 'Not reached within time limit'; continue; fi
                started=$(now)
                step='' excerpt=''
                log="$tmp/act-log"
                run_started=1
                act_call "$budget" -j "$job" -C "$checkout" -W "$workflow" "${act_options[@]}" --env "LOCAL_CI_RUN_ID=$run_id" --concurrent-jobs 1 --rm --pull=false --json --verbose -P 'ubuntu-latest=catthehacker/ubuntu:act-latest' >"$log" 2>&1
                result=$?
                if ! cleanup_owned; then
                    add "${workflow##*/}" "$job" "$ERROR" 'Run-owned Docker containers could not be removed'
                    fail "$ERROR" "Inspect Docker containers with label local-ci-run=$run_id"
                    return
                fi
                # shellcheck disable=SC2034 # Read by the EXIT trap.
                run_started=0
                if ((result == 124 || result == 137)); then state=$TIMEOUT; detail='Time limit exceeded'
                elif ((result != 0)); then
                    step=$(failed_step "$log" "$job")
                    if [[ $step ]]; then
                        state=$FAIL; detail=''
                        excerpt=$(failure_excerpt "$log" "$job" "$step") || excerpt=''
                    else
                        state=$ERROR; detail='act failed outside a job step; rerun locally for diagnostics'
                    fi
                else
                    local summary
                    summary=$(jq -Rnr --arg job "$job" '
                        reduce inputs as $line ({skipped:false, executed:false};
                            ($line | fromjson? | if type == "object" then . else {} end) // {} as $e |
                            .skipped = (.skipped or ($e.jobID == $job and ($e.jobResult == "skipped" or ($e.msg // "" | tostring | contains("Skipping unsupported platform"))))) |
                            .executed = (.executed or ($e.jobID == $job and $e.jobResult == "success")))
                        | if .skipped or (.executed | not) then "not-run" else "pass" end
                    ' "$log") || { add "${workflow##*/}" "$job" "$ERROR" 'Could not parse act output'; continue; }
                    if [[ $summary == not-run ]]; then state=$NOT_RUN; detail='Job not executed'
                    else state=$PASS; detail='Completed successfully.'; fi
                fi
                add "${workflow##*/}" "$job" "$state" "$detail" "$(( $(now) - started ))" "$step" "$excerpt"
            done
        done
        exec {fd}>&-
    fi
    current=$(head) || { github_error "$?" 'Could not recheck PR head'; return; }
    if [[ $current != "$sha" ]]; then fail "$STALE" "PR moved to ${current:0:12}; this result is not current"; return; fi
    code=$PASS
    ((${#states[@]})) || code=$NOT_RUN
    for state in "$TIMEOUT" "$ERROR" "$FAIL" "$NOT_RUN"; do
        for result in "${states[@]}"; do [[ $result != "$state" ]] || { code=$state; return; }; done
    done
}

run
# Recheck immediately before publishing, including early trust or checkout failures.
if [[ $sha && $code != "$STALE" ]]; then
    current=$(head) || { echo '⚠️ Could not recheck PR head' >&2; code=$ERROR; current=$sha; }
    if [[ $current != "$sha" ]]; then code=$STALE; note="PR moved to ${current:0:12}; this result is not current"; fi
fi
if (( submit )); then
    runner=$(api api user --jq '.login') || { echo '⚠️ CI report not posted: GitHub login failed' >&2; exit "$ERROR"; }
    published_at=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
fi
body=$(report)
printf '%s\n' "$body"
if (( submit )); then
    [[ $sha && $code != "$STALE" ]] || { echo '⚠️ CI report not posted: no current PR head was verified' >&2; exit "$code"; }
    pr=$(api api "repos/$owner/$repo/pulls/$number") || { echo '⚠️ CI report not posted: PR body lookup failed' >&2; exit "$ERROR"; }
    current=$(jq -er '.head.sha' <<<"$pr") || { echo '⚠️ CI report not posted: PR body lookup failed' >&2; exit "$ERROR"; }
    [[ $current == "$sha" ]] || { echo '⚠️ CI report not posted: PR head moved' >&2; exit "$STALE"; }
    old_body=$(jq -er '.body // ""' <<<"$pr") || { echo '⚠️ CI report not posted: PR body lookup failed' >&2; exit "$ERROR"; }
    block=$(printf '%s\n%s\n%s' "$marker_start" "$body" "$marker_end")
    new_body=$(jq -nr --arg body "$old_body" --arg block "$block" --arg start "$marker_start" --arg end "$marker_end" '
        ($body | indices($start)) as $starts |
        ($body | indices($end)) as $ends |
        if ($starts | length) == 0 and ($ends | length) == 0 then $body
        elif ($starts | length) == 1 and ($ends | length) == 1 and $starts[0] < $ends[0] then
            $body[0:$starts[0]] + $body[($ends[0] + ($end | length)):]
        else error("managed Local CI markers are malformed") end
        | sub("[[:space:]]+$"; "")
        | . + (if length == 0 then "" else "\n\n" end) + $block
    ') || { echo '⚠️ CI report not posted: managed Local CI markers are malformed' >&2; exit "$ERROR"; }
    payload=$(jq -n --arg body "$new_body" '{body:$body}')
    api api -X PATCH "repos/$owner/$repo/pulls/$number" --input - <<<"$payload" >/dev/null || { echo '⚠️ CI report not posted: PR body update failed' >&2; exit "$ERROR"; }
    verified=$(api api "repos/$owner/$repo/pulls/$number") || { echo '⚠️ CI report posted but could not be verified' >&2; exit "$ERROR"; }
    [[ $(jq -r '.head.sha' <<<"$verified") == "$sha" && $(jq -r '.body // ""' <<<"$verified") == "$new_body" ]] || { echo '⚠️ CI report publication conflicted with another PR update' >&2; exit "$ERROR"; }
    printf 'CI report section: %s#local-ci\n' "$url" >&2
    case $code in "$PASS") status=success ;; "$FAIL") status=failure ;; *) status=error ;; esac
    payload=$(jq -n --arg state "$status" --arg context "$context" --arg description "${labels[code]}" --arg target_url "$url#local-ci" '{state:$state,context:$context,description:$description,target_url:$target_url}')
    api api -X POST "repos/$owner/$repo/statuses/$sha" --input - <<<"$payload" >/dev/null || { echo '⚠️ CI status not posted' >&2; exit "$ERROR"; }
fi
exit "$code"
