#!/usr/bin/env bash
set -euo pipefail

usage() { printf 'Usage: %s https://github.com/OWNER/REPO/pull/NUMBER\n' "$0" >&2; exit 2; }
for tool in gh jq mktemp; do command -v "$tool" >/dev/null || { printf 'Missing required command: %s\n' "$tool" >&2; exit 3; }; done
(($# == 1)) || usage
[[ $1 =~ ^https://github\.com/([^/]+)/([^/]+)/pull/([0-9]+)([/?#].*)?$ ]] || usage
owner=${BASH_REMATCH[1]} repo=${BASH_REMATCH[2]} number=${BASH_REMATCH[3]}
tmp=$(mktemp -d -t hosted-checks-XXXXXXXX)
trap 'rm -rf -- "$tmp"' EXIT

sha=$(gh api "repos/$owner/$repo/pulls/$number" --jq .head.sha) || { echo 'GitHub PR lookup failed' >&2; exit 1; }
gh api "repos/$owner/$repo/commits/$sha/check-runs?per_page=100" --paginate --slurp >"$tmp/runs.json" || {
    echo 'GitHub check-run lookup failed' >&2
    exit 1
}
gh api "repos/$owner/$repo/commits/$sha/statuses?per_page=100" --paginate --slurp >"$tmp/statuses.json" || {
    echo 'GitHub commit-status lookup failed' >&2
    exit 1
}
: >"$tmp/annotations.ndjson"
while IFS= read -r id; do
    gh api "repos/$owner/$repo/check-runs/$id/annotations?per_page=100" --paginate --slurp \
        | jq -c --argjson id "$id" '{key:($id|tostring),value:[.[][] | {level:.annotation_level,message,path,start_line,title}]}' \
        >>"$tmp/annotations.ndjson" || { printf 'GitHub annotation lookup failed for check run %s\n' "$id" >&2; exit 1; }
done < <(jq -r '.[] | .check_runs[] | select(.conclusion != null and .conclusion != "success" and .conclusion != "neutral" and .conclusion != "skipped") | .id' "$tmp/runs.json")
jq -s 'from_entries' "$tmp/annotations.ndjson" >"$tmp/annotations.json"

jq -n \
  --arg sha "$sha" \
  --slurpfile runs "$tmp/runs.json" \
  --slurpfile statuses "$tmp/statuses.json" \
  --slurpfile annotations "$tmp/annotations.json" '
  {
    head_sha:$sha,
    check_runs: [
      $runs[0][] | .check_runs[] |
      {id,name,status,conclusion,details_url,annotations:($annotations[0][(.id|tostring)] // [])}
    ],
    statuses: [
      $statuses[0][] | .[] | {context,state,description,target_url,created_at}
    ]
  }
'
