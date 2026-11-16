#!/usr/bin/env bash
# Print the PRs and ClickUp task IDs between two refs of a GitHub repository.
set -euo pipefail

usage() {
    printf 'Usage: %s OWNER/REPO BASE TARGET\n' "$0" >&2
    exit 2
}
for tool in gh jq; do
    command -v "$tool" >/dev/null || { printf 'Missing required command: %s\n' "$tool" >&2; exit 3; }
done
(($# == 3)) || usage
repo=$1 base=$2 target=$3
[[ $repo =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || usage

sha() { gh api "repos/$repo/commits/$1" --jq .sha; }
base_sha=$(sha "$base") || { printf 'Cannot resolve %s in %s\n' "$base" "$repo" >&2; exit 1; }
target_sha=$(sha "$target") || { printf 'Cannot resolve %s in %s\n' "$target" "$repo" >&2; exit 1; }

compare="repos/$repo/compare/$base_sha...$target_sha"
meta=$(gh api "$compare?per_page=1" --jq '{status, ahead_by, behind_by}') || { echo 'GitHub compare failed' >&2; exit 1; }
# One line per commit: sha, parent count, subject.
commits=$(gh api "$compare?per_page=100" --paginate \
    --jq '.commits[] | [.sha, (.parents | length), (.commit.message | split("\n")[0])] | @tsv') \
    || { echo 'GitHub compare pagination failed' >&2; exit 1; }

declare -A seen=()
prs=()
direct='[]'
while IFS=$'\t' read -r commit parents subject; do
    [[ -n $commit ]] || continue
    number=''
    if [[ $subject =~ \(#([0-9]+)\)$ || $subject =~ ^Merge\ pull\ request\ #([0-9]+) ]]; then
        number=${BASH_REMATCH[1]}
    elif ((parents > 1)); then
        continue
    else
        number=$(gh api "repos/$repo/commits/$commit/pulls" --jq '[.[] | select(.merged_at != null)][0].number // empty') || number=''
    fi
    if [[ -z $number ]]; then
        direct=$(jq -c --arg sha "$commit" --arg subject "$subject" '. + [{sha: $sha, subject: $subject}]' <<<"$direct")
    elif [[ -z ${seen[$number]:-} ]]; then
        seen[$number]=1
        prs+=("$number")
    fi
done <<<"$commits"

pr_json='[]'
for number in "${prs[@]}"; do
    # Associated tasks only: "- ClickUp:" reference lines and association tokens, never "Related:" mentions.
    pr=$(gh api "repos/$repo/pulls/$number" --jq '{
        number, title, url: .html_url, base: .base.ref,
        tasks: ([(.body // "") | split("\n")[]
            | (select(test("^\\s*-\\s*ClickUp:")) | scan("app\\.clickup\\.com/t/(?:[0-9]+/)?([A-Za-z0-9_-]+)")),
              scan("<!-- #([A-Za-z0-9_-]+)\\[")] | map(.[0]) | unique)
    }') || { printf 'GitHub PR lookup failed for #%s\n' "$number" >&2; exit 1; }
    pr_json=$(jq -c --argjson pr "$pr" '. + [$pr]' <<<"$pr_json")
done

jq -n \
    --arg repo "$repo" --arg base "$base_sha" --arg target "$target_sha" --arg target_ref "$target" \
    --argjson meta "$meta" --argjson prs "$pr_json" --argjson direct "$direct" '{
    repo: $repo, base: $base, target: $target, target_ref: $target_ref,
    status: $meta.status, ahead_by: $meta.ahead_by, behind_by: $meta.behind_by,
    compare_url: "https://github.com/\($repo)/compare/\($base[0:12])...\($target[0:12])",
    tasks: ([$prs[].tasks[]] | unique),
    prs: $prs,
    direct_commits: $direct
}'
