#!/usr/bin/env bash
# Run one read-only review round on the other provider's CLI, with a time limit.
# Exit 0 with a VERDICT line in OUTPUT_FILE; any other exit means: use the fallback.
set -euo pipefail

usage() {
    printf 'Usage: %s claude|codex REPO_DIR BRIEF_FILE OUTPUT_FILE\n' "$0" >&2
    exit 2
}

(($# == 4)) || usage
provider=$1 repo=$2 brief=$3 output=$4
[[ -d $repo && -f $brief ]] || usage
limit=${CROSS_REVIEW_TIMEOUT:-600}
command -v timeout >/dev/null || { echo 'timeout is unavailable' >&2; exit 3; }

case $provider in
claude)
    command -v claude >/dev/null || { echo 'claude CLI is unavailable' >&2; exit 3; }
    # Headless runs default to the sdk-cli entrypoint, which counts about 2x
    # more against subscription limits. An explicit, honest label replaces it
    # and any value inherited from a parent session; settings.json cannot set it.
    cd -- "$repo"
    CLAUDE_CODE_ENTRYPOINT=lynx-cross-review timeout -k 10 "$limit" claude -p \
        --model "${CROSS_REVIEW_CLAUDE_MODEL:-opus}" \
        ${CROSS_REVIEW_EFFORT:+--effort "$CROSS_REVIEW_EFFORT"} \
        --strict-mcp-config \
        --tools Read,Grep,Glob,Bash \
        --allowedTools 'Read,Grep,Glob,Bash(git diff:*),Bash(git status:*),Bash(git log:*),Bash(git show:*),Bash(git merge-base:*)' \
        --permission-mode dontAsk \
        --no-session-persistence \
        <"$brief" >"$output"
    ;;
codex)
    command -v codex >/dev/null || { echo 'codex CLI is unavailable' >&2; exit 3; }
    # --ignore-user-config skips MCP servers: they read OAuth tokens from the
    # keyring, and a locked keyring hangs codex. Effort then needs a value.
    timeout -k 10 "$limit" codex exec --ignore-user-config \
        ${CROSS_REVIEW_CODEX_MODEL:+-m "$CROSS_REVIEW_CODEX_MODEL"} \
        -c "model_reasoning_effort=\"${CROSS_REVIEW_EFFORT:-high}\"" \
        -C "$repo" -s read-only --ephemeral \
        -o "$output" - <"$brief" >/dev/null 2>"$output.log"
    ;;
*) usage ;;
esac

[[ -s $output ]] || { echo 'Reviewer returned no reply' >&2; exit 4; }
grep -qE '^VERDICT: (APPROVE|CHANGES)' "$output" || { echo 'Reviewer reply has no VERDICT line' >&2; exit 4; }
