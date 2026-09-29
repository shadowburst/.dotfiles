#!/usr/bin/env bash
# Replace the managed PR table with a report from stdin; empty input removes it.
set -euo pipefail
(($# == 2)) && [[ $2 =~ ^[0-9a-f]{40}$ ]] || { echo 'Usage: publish-validation.sh PR_URL HEAD_SHA < REPORT' >&2; exit 2; }
url=$1 sha=$2
report=$(cat)
[[ ! $report || ($report == *"Tested head: \`$sha\`"* && $report == *$'\n| **Overall** | '* ) ]] || { echo 'Incomplete report or wrong commit' >&2; exit 1; }
pr=$(gh pr view "$url" --json body,headRefOid)
[[ $(jq -r .headRefOid <<<"$pr") == "$sha" ]] || { echo 'PR head changed; report not published' >&2; exit 1; }
body=$(jq -r --arg report "$report" '
    "<!-- local-ci-report:start -->" as $start | "<!-- local-ci-report:end -->" as $end |
    (.body // "") | (indices($start)) as $starts | (indices($end)) as $ends |
    if ($starts | length) == 0 and ($ends | length) == 0 then .
    elif ($starts | length) == 1 and ($ends | length) == 1 and $starts[0] < $ends[0] then
        .[0:$starts[0]] + .[($ends[0] + ($end | length)):]
    else error("Malformed Validation markers; PR body left unchanged") end |
    if $report == "" and ($starts | length) == 0 then .
    else sub("[[:space:]]+$"; "") +
        (if $report == "" then "" else
            (if length == 0 then "" else "\n\n" end) + $start + "\n" + $report + "\n" + $end
         end)
    end
' <<<"$pr")
if [[ $body != "$(jq -r '.body // ""' <<<"$pr")" ]]; then
    printf '%s' "$body" | gh pr edit "$url" --body-file - >/dev/null
fi
verified=$(gh pr view "$url" --json body,headRefOid)
[[ $(jq -r .headRefOid <<<"$verified") == "$sha" && $(jq -r '.body // ""' <<<"$verified") == "$body" ]] || {
    echo 'PR changed during publication; report not verified' >&2
    exit 1
}
