#!/usr/bin/env bash
set -euo pipefail

usage() { printf 'Usage: %s https://github.com/OWNER/REPO/pull/NUMBER\n' "$0" >&2; exit 2; }
for tool in gh jq mktemp; do
    command -v "$tool" >/dev/null || { printf 'Missing required command: %s\n' "$tool" >&2; exit 3; }
done
(($# == 1)) || usage
[[ $1 =~ ^https://github\.com/([^/]+)/([^/]+)/pull/([0-9]+)([/?#].*)?$ ]] || usage
owner=${BASH_REMATCH[1]} repo=${BASH_REMATCH[2]} number=${BASH_REMATCH[3]}
url="https://github.com/$owner/$repo/pull/$number"

tmp=$(mktemp -d -t collect-reviews-XXXXXXXX)
trap 'rm -rf -- "$tmp"' EXIT

if ! gh api "repos/$owner/$repo/pulls/$number" >"$tmp/pr.json"; then
    echo 'GitHub PR lookup failed' >&2
    exit 1
fi
if ! gh api "repos/$owner/$repo/pulls/$number/reviews?per_page=100" --paginate --slurp >"$tmp/review-pages.json"; then
    echo 'GitHub review lookup failed' >&2
    exit 1
fi
jq '[.[][] | select(.submitted_at != null and .state != "PENDING")]' "$tmp/review-pages.json" >"$tmp/reviews.json"
: >"$tmp/comments.ndjson"
while IFS= read -r review_id; do
    if ! gh api "repos/$owner/$repo/pulls/$number/reviews/$review_id/comments?per_page=100" --paginate --slurp >"$tmp/comment-pages.json"; then
        printf 'GitHub comment lookup failed for review %s\n' "$review_id" >&2
        exit 1
    fi
    jq -c '.[][]' "$tmp/comment-pages.json" >>"$tmp/comments.ndjson"
done < <(jq -r '.[].id' "$tmp/reviews.json")
jq -s '.' "$tmp/comments.ndjson" >"$tmp/comments.json"

read -r -d '' query <<'GRAPHQL' || true
query($owner: String!, $repo: String!, $number: Int!, $endCursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $endCursor) {
        nodes {
          id
          isResolved
          comments(first: 1) { nodes { databaseId } }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}
GRAPHQL
if ! gh api graphql --paginate --slurp -f query="$query" -F owner="$owner" -F repo="$repo" -F number="$number" >"$tmp/thread-pages.json"; then
    echo 'GitHub review-thread lookup failed' >&2
    exit 1
fi
if ! jq -e 'all(.[]; (.errors | not) and (.data.repository.pullRequest != null))' "$tmp/thread-pages.json" >/dev/null; then
    echo 'GitHub review-thread lookup returned an error' >&2
    exit 1
fi
jq '
  [.[].data.repository.pullRequest.reviewThreads.nodes[]
    | select(.comments.nodes[0].databaseId != null)
    | {key: (.comments.nodes[0].databaseId | tostring), value: {thread_id: .id, resolved: .isResolved}}]
  | from_entries
' "$tmp/thread-pages.json" >"$tmp/resolution.json"

jq -n \
  --arg url "$url" \
  --slurpfile pr "$tmp/pr.json" \
  --slurpfile reviews "$tmp/reviews.json" \
  --slurpfile comments "$tmp/comments.json" \
  --slurpfile resolution "$tmp/resolution.json" '
  def review_feedback($review):
    select(($review.body // "") | length > 0) |
    {
      kind: "review",
      id: $review.id,
      review_id: $review.id,
      author: $review.user.login,
      body: $review.body,
      commit_id: $review.commit_id,
      url: $review.html_url
    };
  def comment_feedback($comment):
    ($comment.in_reply_to_id // $comment.id | tostring) as $root |
    {
      kind: "comment",
      id: $comment.id,
      review_id: $comment.pull_request_review_id,
      author: $comment.user.login,
      body: $comment.body,
      path: $comment.path,
      line: $comment.line,
      original_line: $comment.original_line,
      side: $comment.side,
      diff_hunk: $comment.diff_hunk,
      commit_id: $comment.commit_id,
      original_commit_id: $comment.original_commit_id,
      url: $comment.html_url,
      in_reply_to_id: $comment.in_reply_to_id,
      thread_id: ($resolution[0][$root].thread_id // null),
      resolved: ($resolution[0][$root].resolved // null)
    };
  $pr[0] as $p |
  {
    pr: {
      url: $url,
      owner: ($p.base.repo.owner.login // ($url | capture("github.com/(?<owner>[^/]+)").owner)),
      repo: ($p.base.repo.name // ($url | capture("github.com/[^/]+/(?<repo>[^/]+)").repo)),
      number: $p.number,
      title: $p.title,
      body: $p.body,
      author: $p.user.login,
      head_sha: $p.head.sha,
      head_ref: $p.head.ref,
      base_ref: $p.base.ref
    },
    feedback: [
      $reviews[0][] as $review |
      review_feedback($review),
      ($comments[0][] | select(.pull_request_review_id == $review.id) | comment_feedback(.))
    ]
  }
'