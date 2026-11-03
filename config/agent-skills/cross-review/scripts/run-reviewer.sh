#!/usr/bin/env bash
# Run one read-only cross-review round on the other provider's model.
set -euo pipefail

usage() {
    printf 'Usage: %s claude|codex REPO_DIR BRIEF_FILE OUTPUT_FILE\n' "$0" >&2
    exit 2
}

(($# == 4)) || usage
provider=$1 repo=$2 brief=$3 output=$4
[[ -d $repo && -f $brief ]] || usage

case $provider in
claude)
    command -v claude >/dev/null || { echo 'claude CLI is unavailable' >&2; exit 3; }
    # Headless runs default to the sdk-cli entrypoint, which counts about 2x
    # more against subscription limits. An explicit, honest label replaces it
    # and any value inherited from a parent session; settings.json cannot set it.
    cd -- "$repo"
    CLAUDE_CODE_ENTRYPOINT=lynx-cross-review claude -p \
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
    codex exec \
        ${CROSS_REVIEW_CODEX_MODEL:+-m "$CROSS_REVIEW_CODEX_MODEL"} \
        ${CROSS_REVIEW_EFFORT:+-c "model_reasoning_effort=\"$CROSS_REVIEW_EFFORT\""} \
        -C "$repo" -s read-only --ephemeral \
        -o "$output" - <"$brief" >/dev/null 2>"$output.log" ||
        { printf 'codex exec failed; see %s\n' "$output.log" >&2; exit 4; }
    ;;
*) usage ;;
esac

[[ -s $output ]] || { echo 'Reviewer returned no reply' >&2; exit 4; }
grep -qE '^VERDICT: (APPROVE|CHANGES)' "$output" || { echo 'Reviewer reply has no VERDICT line' >&2; exit 4; }
