#!/usr/bin/env bash
set -euo pipefail

usage() {
    printf 'Usage: %s collect PR_URL\n       %s apply PR_URL HEAD_SHA PLAN.json\n' "$0" "$0" >&2
    exit 2
}

for tool in gh jq sha256sum; do
    command -v "$tool" >/dev/null || { printf 'Missing required command: %s\n' "$tool" >&2; exit 3; }
done
(($# >= 2)) || usage
action=$1 url=$2
[[ $url =~ ^https://github\.com/([^/]+)/([^/]+)/pull/([0-9]+)([/?#].*)?$ ]] || usage
owner=${BASH_REMATCH[1]} repo=${BASH_REMATCH[2]} number=${BASH_REMATCH[3]}
collector=${COLLECT_REVIEWS:-"$(dirname "$0")/collect-reviews.sh"}
[[ -x $collector ]] || { echo 'Review collector is unavailable' >&2; exit 3; }

case $action in
    collect)
        (($# == 2)) || usage
        exec "$collector" "$url"
        ;;
    apply)
        (($# == 4)) || usage
        pinned=$3 plan=$4
        [[ $pinned =~ ^[0-9a-f]{40}$ && -f $plan ]] || usage
        ;;
    *) usage ;;
esac

data=$("$collector" "$url") || exit $?
[[ $(jq -r '.pr.head_sha' <<<"$data") == "$pinned" ]] || { echo 'PR head moved before reconciliation' >&2; exit 5; }
jq -e '
  type == "array" and length > 0 and
  all(.[];
    (.thread_id | type == "string" and length > 0) and
    (.path | type == "string" and length > 0) and
    (.comment_url | type == "string" and startswith("https://github.com/")) and
    (.disposition == "addressed" or .disposition == "obsolete") and
    (.evidence | type == "string" and length > 0))
' "$plan" >/dev/null || { echo 'Invalid reconciliation plan' >&2; exit 2; }

# Every selected thread must have a collected root comment from this PR.
while IFS= read -r thread_id; do
    jq -e --arg id "$thread_id" '[.feedback[] | select(.kind == "comment" and .thread_id == $id and .in_reply_to_id == null)] | length == 1' <<<"$data" >/dev/null || {
        printf 'Unknown or ambiguous review thread: %s\n' "$thread_id" >&2
        exit 2
    }
done < <(jq -r '.[].thread_id' "$plan")

check_head() {
    local current
    current=$(gh api "repos/$owner/$repo/pulls/$number" --jq .head.sha) || { echo 'Could not recheck PR head' >&2; return 1; }
    [[ $current == "$pinned" ]] || { echo 'PR head moved during reconciliation' >&2; return 5; }
}

query='mutation($thread: ID!) { resolveReviewThread(input: {threadId: $thread}) { thread { id isResolved } } }'
failed=0 count=$(jq length "$plan")
for ((i = 0; i < count; i++)); do
    thread_id=$(jq -r ".[${i}].thread_id" "$plan")
    if jq -e --arg id "$thread_id" '[.feedback[] | select(.kind == "comment" and .thread_id == $id and .resolved == true)] | length > 0' <<<"$data" >/dev/null; then
        continue
    fi

    check_head || exit $?
    root_id=$(jq -r --arg id "$thread_id" '.feedback[] | select(.kind == "comment" and .thread_id == $id and .in_reply_to_id == null) | .id' <<<"$data")
    disposition=$(jq -r ".[${i}].disposition" "$plan")
    evidence=$(jq -r ".[${i}].evidence" "$plan")
    digest=$(jq -cnS --arg head "$pinned" --arg thread "$thread_id" --arg disposition "$disposition" --arg evidence "$evidence" \
        '{head:$head,thread:$thread,disposition:$disposition,evidence:$evidence}' | sha256sum | cut -c1-16)
    marker="<!-- publish-pr-reconciliation:$pinned:$digest -->"

    if ! jq -e --arg id "$thread_id" --arg marker "$marker" \
        'any(.feedback[]; .kind == "comment" and .thread_id == $id and ((.body // "") | contains($marker)))' <<<"$data" >/dev/null; then
        label=${disposition^}
        body="**$label** — $evidence

$marker"
        payload=$(jq -n --arg body "$body" '{body:$body}')
        if ! gh api -X POST "repos/$owner/$repo/pulls/$number/comments/$root_id/replies" --input - <<<"$payload" >/dev/null; then
            printf 'Could not reply to review thread: %s\n' "$thread_id" >&2
            failed=1
            continue
        fi
    fi

    check_head || exit $?
    if ! response=$(gh api graphql -f query="$query" -f thread="$thread_id") ||
       ! jq -e '.errors == null and .data.resolveReviewThread.thread.isResolved == true' <<<"$response" >/dev/null; then
        printf 'Could not resolve review thread: %s\n' "$thread_id" >&2
        failed=1
    fi
done
((failed == 0)) || exit 1
printf 'Replied to and resolved %s thread(s).\n' "$count"
