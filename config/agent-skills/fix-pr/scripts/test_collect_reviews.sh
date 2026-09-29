#!/usr/bin/env bash
set -euo pipefail

script="$(dirname "$0")/collect-reviews.sh"
for tool in jq; do command -v "$tool" >/dev/null || { echo "missing test dependency: $tool" >&2; exit 1; }; done
root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT
mkdir "$root/bin"
export TEST_ROOT="$root" PATH="$root/bin:$PATH"

cat >"$root/bin/gh" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$TEST_ROOT/calls"
[[ ! ${TEST_FAIL:-} ]] || exit 1
[[ ! ${TEST_FAIL_MATCH:-} || $* != *"$TEST_FAIL_MATCH"* ]] || exit 1
case "$*" in
  'api user --jq .login') echo reviewer ;;
  'api repos/Example/project/pulls/7')
    jq -n '{html_url:"https://github.com/Example/project/pull/7",number:7,title:"Improve cover",body:"PR body",user:{login:"author"},head:{sha:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",ref:"feature"},base:{ref:"main"}}' ;;
  'api repos/Example/project/pulls/7/reviews?per_page=100 --paginate --slurp')
    jq -n '[[{id:11,state:"PENDING",submitted_at:null,user:{login:"reviewer"},body:"Draft summary",commit_id:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",html_url:null}],[{id:12,state:"COMMENTED",submitted_at:"2026-01-02T03:04:05Z",user:{login:"review-bot[bot]"},body:"Bot summary",commit_id:"9999999999999999999999999999999999999999",html_url:"https://github.com/Example/project/pull/7#pullrequestreview-12"}]]' ;;
  'api repos/Example/project/pulls/7/reviews/11/comments?per_page=100 --paginate --slurp')
    body=$(printf 'Use $(touch %s/not-safe) and `code`\nsecond line' "$TEST_ROOT")
    jq -n --arg body "$body" '[[{id:101,pull_request_review_id:11,user:{login:"reviewer"},body:$body,path:"src/a.php",line:8,original_line:7,side:"RIGHT",diff_hunk:"@@ -7 +7 @@",commit_id:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",original_commit_id:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",html_url:null,in_reply_to_id:null}]]' ;;
  'api repos/Example/project/pulls/7/reviews/12/comments?per_page=100 --paginate --slurp')
    jq -n '[[{id:102,pull_request_review_id:12,user:{login:"review-bot[bot]"},body:"Remove this",path:"src/b.php",line:null,original_line:4,side:"RIGHT",diff_hunk:"@@ -4 +4 @@",commit_id:"9999999999999999999999999999999999999999",original_commit_id:"9999999999999999999999999999999999999999",html_url:"https://github.com/Example/project/pull/7#discussion_r102",in_reply_to_id:null}],[{id:103,pull_request_review_id:12,user:{login:"author"},body:"Agreed",path:"src/b.php",line:null,original_line:4,side:"RIGHT",diff_hunk:"@@ -4 +4 @@",commit_id:"9999999999999999999999999999999999999999",original_commit_id:"9999999999999999999999999999999999999999",html_url:"https://github.com/Example/project/pull/7#discussion_r103",in_reply_to_id:102}]]' ;;
  'api graphql --paginate --slurp -f query='*)
    jq -n '[{data:{repository:{pullRequest:{reviewThreads:{nodes:[{isResolved:false,comments:{nodes:[{databaseId:101}]}}],pageInfo:{hasNextPage:true,endCursor:"one"}}}}}},{data:{repository:{pullRequest:{reviewThreads:{nodes:[{isResolved:true,comments:{nodes:[{databaseId:102}]}}],pageInfo:{hasNextPage:false,endCursor:null}}}}}}]' ;;
  *) printf 'unexpected gh: %s\n' "$*" >&2; exit 1 ;;
esac
EOF
chmod +x "$root/bin/gh"

url=https://github.com/Example/project/pull/7
"$script" "$url" >"$root/out.json"

unsafe=$(printf 'Use $(touch %s/not-safe) and `code`\nsecond line' "$root")
jq -e --arg unsafe "$unsafe" '
  .pr == {
    url:"https://github.com/Example/project/pull/7",
    owner:"Example",
    repo:"project",
    number:7,
    title:"Improve cover",
    body:"PR body",
    author:"author",
    head_sha:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    head_ref:"feature",
    base_ref:"main"
  }
  and (.feedback | length == 5)
  and (.feedback[0] | .kind == "review" and .id == 11 and .author == "reviewer" and .body == "Draft summary")
  and (.feedback[1] | .kind == "comment" and .id == 101 and .resolved == false and .body == $unsafe)
  and (.feedback[2] | .kind == "review" and .id == 12 and .author == "review-bot[bot]" and .body == "Bot summary")
  and (.feedback[3] | .kind == "comment" and .id == 102 and .resolved == true and .original_line == 4)
  and (.feedback[4] | .kind == "comment" and .id == 103 and .resolved == true and .in_reply_to_id == 102)
  and ([.feedback[] | has("state") or has("submitted_at")] | any | not)
' "$root/out.json" >/dev/null
[[ ! -e $root/not-safe ]]
[[ $(grep -c 'reviews?per_page=100' "$root/calls") == 1 ]]
[[ $(grep -c '/comments?per_page=100' "$root/calls") == 2 ]]

grep -q 'graphql --paginate --slurp' "$root/calls"

check_failure() {
    local match=$1 message=$2 actual=0
    TEST_FAIL_MATCH="$match" "$script" "$url" >"$root/fail.out" 2>"$root/fail.err" || actual=$?
    ((actual != 0))
    grep -q "$message" "$root/fail.err"
}
check_failure 'pulls/7' 'GitHub PR lookup failed'
check_failure 'reviews?per_page' 'GitHub review lookup failed'
check_failure '/reviews/11/comments' 'GitHub comment lookup failed for review 11'
check_failure 'graphql' 'GitHub review-thread lookup failed'

actual=0
TEST_FAIL=1 "$script" "$url" >"$root/fail.out" 2>"$root/fail.err" || actual=$?
((actual != 0))
grep -q 'GitHub login lookup failed' "$root/fail.err"

actual=0
"$script" https://example.com/not-a-pr >"$root/invalid.out" 2>"$root/invalid.err" || actual=$?
((actual == 2))
grep -q '^Usage:' "$root/invalid.err"

printf 'review collector checks passed\n'
