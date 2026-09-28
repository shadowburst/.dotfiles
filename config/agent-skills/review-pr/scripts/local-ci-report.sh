#!/usr/bin/env bash
# Run explicitly opted-in GitHub Actions locally; print and optionally post a PR report.
# Linux, Bash 4+, jq, flock, timeout (GNU coreutils), gh, act, git, Docker required.
set -uo pipefail

PASS=0 FAIL=1 NOT_RUN=2 ERROR=3 TIMEOUT=4 STALE=5
labels=('Local checks passed' 'Local checks failed' 'Not run' 'Runner error' 'Timed out' 'Stale PR head')
icons=('✅' '❌' '⚪' '⚠️' '⏱️' '🔄')
marker='<!-- local-ci-report -->'
context='local-ci/report'

usage() { printf 'Usage: %s [--timeout MINUTES] [--secret-file FILE] [--no-post] https://github.com/OWNER/REPO/pull/NUMBER\n' "$0" >&2; exit 2; }
(( BASH_VERSINFO[0] >= 4 )) || { echo 'Bash 4+ required' >&2; exit 3; }
for tool in jq flock timeout gh act git docker mktemp stat realpath; do
    command -v "$tool" >/dev/null || { printf 'Missing required command: %s\n' "$tool" >&2; exit 3; }
done
timeout --version | grep -q 'GNU coreutils' || { echo 'GNU coreutils timeout required' >&2; exit 3; }
timeout 10 docker info >/dev/null 2>&1 || { echo 'Docker daemon is unavailable' >&2; exit 3; }
timeout_minutes=60 secret_file= no_post=0 url=
while (($#)); do
    case $1 in
        --timeout) (($# >= 2)) || usage; timeout_minutes=$2; shift 2 ;;
        --secret-file) (($# >= 2)) || usage; secret_file=$2; shift 2 ;;
        --no-post) no_post=1; shift ;;
        --*) usage ;;
        *) [[ ! $url ]] || usage; url=$1; shift ;;
    esac
done
[[ $timeout_minutes =~ ^[0-9]+$ ]] && ((timeout_minutes > 0)) || usage
[[ ! $secret_file || -f $secret_file ]] || usage
[[ $url =~ ^https://github\.com/([^/]+)/([^/]+)/pull/([0-9]+)([/?#].*)?$ ]] || usage
owner=${BASH_REMATCH[1]} repo=${BASH_REMATCH[2]} number=${BASH_REMATCH[3]}
url="https://github.com/$owner/$repo/pull/$number"
if [[ $secret_file ]]; then secret_file=$(realpath "$secret_file") || exit 3; fi

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
safe() { printf '%s' "$1" | LC_ALL=C tr '\000-\037\177`*_[]<>|' ' ' | cut -c1-160; }
api() { timeout 45 gh "$@" 2>/dev/null; }
head() { local response; response=$(api api "repos/$owner/$repo/pulls/$number") || return $?; jq -er '.head.sha' <<<"$response"; }
fail() { code=$1 note=$2; }
github_error() {
    if (( $1 == 124 || $1 == 137 )); then fail "$TIMEOUT" 'GitHub lookup or checkout timed out'
    else fail "$ERROR" "$2"; fi
}

# Bash arrays keep untrusted workflow names and messages out of shell syntax.
names=() jobs=() states=() details=() sha= note= code=$NOT_RUN
add() { names+=("$1"); jobs+=("$2"); states+=("$3"); details+=("$4"); }
report() {
    printf '## Local CI\n%s **%s**\n' "${icons[code]}" "${labels[code]}"
    [[ ! $sha ]] || printf 'Tested head: `%s`\n' "$sha"
    if ((${#names[@]})); then
        printf '\n| Workflow | Job | Result | Detail |\n| --- | --- | --- | --- |\n'
        local i
        for i in "${!names[@]}"; do
            printf '| `%s` | `%s` | %s %s | %s |\n' "$(safe "${names[i]}")" "$(safe "${jobs[i]}")" "${icons[${states[i]}]}" "${labels[${states[i]}]}" "$(safe "${details[i]}")"
        done
    elif [[ ! $note && $code == $NOT_RUN ]]; then
        printf '\nNo `local-*.yaml` workflows configured.\n'
    fi
    [[ ! $note ]] || printf '\n⚠️ %s\n' "$(safe "$note")"
}

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
checkout="$tmp/checkout"
run() {
    local pr repository organizations author membership actual workflow listing row job result log budget started state detail lockdir fd info current
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
    if ((membership == 124 || membership == 137)); then fail "$TIMEOUT" 'GitHub lookup or checkout timed out'; return; fi
    if ((membership)); then fail "$NOT_RUN" 'PR author could not be verified as an organization member'; return; fi

    budget=$(remaining)
    if ((budget == 0)); then fail "$TIMEOUT" 'GitHub lookup or checkout timed out'; return; fi
    timeout "${budget}s" gh repo clone "$owner/$repo" "$checkout" -- --filter=blob:none >/dev/null 2>&1
    result=$?
    if ((result)); then
        if ((result == 124 || result == 137)); then fail "$TIMEOUT" 'GitHub lookup or checkout timed out'
        else fail "$ERROR" 'GitHub clone failed'; fi
        return
    fi
    budget=$(remaining)
    if ((budget == 0)); then fail "$TIMEOUT" 'GitHub lookup or checkout timed out'; return; fi
    (cd "$checkout" && timeout "${budget}s" gh pr checkout "$number" --detach -R "$owner/$repo" >/dev/null 2>&1)
    result=$?
    if ((result)); then
        if ((result == 124 || result == 137)); then fail "$TIMEOUT" 'GitHub lookup or checkout timed out'
        else fail "$ERROR" 'GitHub checkout failed'; fi
        return
    fi
    actual=$(git -C "$checkout" rev-parse HEAD) || { fail "$ERROR" 'Could not verify checkout'; return; }
    if [[ $actual != "$sha" ]]; then fail "$STALE" 'Checkout moved before execution'; return; fi
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
                log="$tmp/act-log"
                run_started=1
                act_call "$budget" -j "$job" -C "$checkout" -W "$workflow" "${act_options[@]}" --env "LOCAL_CI_RUN_ID=$run_id" --concurrent-jobs 1 --rm --pull=false --json --verbose -P 'ubuntu-latest=catthehacker/ubuntu:act-latest' >"$log" 2>&1
                result=$?
                if ! cleanup_owned; then
                    add "${workflow##*/}" "$job" "$ERROR" 'Run-owned Docker containers could not be removed'
                    fail "$ERROR" "Inspect Docker containers with label local-ci-run=$run_id"
                    return
                fi
                run_started=0
                if ((result == 124 || result == 137)); then state=$TIMEOUT; detail='Time limit exceeded; inspect Docker for containers left by act'
                elif ((result != 0)); then
                    detail=$(jq -Rr 'fromjson? | select(type == "object" and .stepResult == "failure") | if .jobID then "Job \(.jobID)" else "act exited nonzero; rerun locally for diagnostics" end + (if .step then ", step \(.step)" else "" end)' "$log" | tail -1)
                    if [[ $detail ]]; then state=$FAIL; else state=$ERROR; detail='act failed outside a job step; rerun locally for diagnostics'; fi
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
                    else state=$PASS; detail='Job executed'; fi
                fi
                add "${workflow##*/}" "$job" "$state" "$detail; $(( $(now) - started ))s"
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
# Recheck immediately before publishing, including early trust/checkout failures.
if [[ $sha && $code != "$STALE" ]]; then
    current=$(head) || { echo '⚠️ Could not recheck PR head' >&2; code=$ERROR; current=$sha; }
    if [[ $current != "$sha" ]]; then code=$STALE; note="PR moved to ${current:0:12}; this result is not current"; fi
fi
body=$(report)
printf '%s\n' "$body"
if (( ! no_post )); then
    login=$(api api user --jq '.login') || { echo '⚠️ CI report not posted: GitHub login failed' >&2; exit "$ERROR"; }
    comments=$(api api "repos/$owner/$repo/issues/$number/comments?per_page=100" --paginate --slurp) || { echo '⚠️ CI report not posted: comment lookup failed' >&2; exit "$ERROR"; }
    previous=$(jq -r --arg marker "$marker" --arg login "$login" '[.[][] | select((.body // "" | contains($marker)) and (.user.login | ascii_downcase) == ($login | ascii_downcase))] | max_by(.id) | .id // empty' <<<"$comments") || exit "$ERROR"
    payload=$(jq -n --arg body "$body" --arg marker "$marker" '{body: ($body + "\n\n" + $marker)}')
    if [[ $previous ]]; then endpoint="repos/$owner/$repo/issues/comments/$previous"; method=PATCH
    else endpoint="repos/$owner/$repo/issues/$number/comments"; method=POST; fi
    comment=$(api api -X "$method" "$endpoint" --input - <<<"$payload") && comment_url=$(jq -er '.html_url' <<<"$comment") || { echo '⚠️ CI report not posted' >&2; exit "$ERROR"; }
    printf 'CI report comment: %s\n' "$comment_url" >&2
    if [[ $sha && $code != "$STALE" ]]; then
        case $code in "$PASS") status=success ;; "$FAIL") status=failure ;; *) status=error ;; esac
        payload=$(jq -n --arg state "$status" --arg context "$context" --arg description "${labels[code]}" --arg target_url "$comment_url" '{state:$state,context:$context,description:$description,target_url:$target_url}')
        api api -X POST "repos/$owner/$repo/statuses/$sha" --input - <<<"$payload" >/dev/null || { echo '⚠️ CI status not posted' >&2; exit "$ERROR"; }
    fi
fi
exit "$code"
