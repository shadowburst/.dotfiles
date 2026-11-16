#!/usr/bin/env bash
# Run the evidence agent on the other provider's model.
#
# The agent runs without a sandbox: it must run the project's tests and browser,
# and Lerd's PHP containers mount $HOME read-write, so a sandbox around the CLI
# would not contain the PHP it runs. The guards are the brief, this script's
# check that HEAD and the working tree are unchanged, and the caller's check of
# the report.
set -euo pipefail

usage() {
    printf 'Usage: %s claude|codex REPO_DIR BRIEF_FILE OUTPUT_FILE\n' "$0" >&2
    exit 2
}

(($# == 4)) || usage
provider=$1 repo=$2 brief=$3 output=$4
[[ -d $repo && -f $brief ]] || usage

head_before=$(git -C "$repo" rev-parse HEAD)
tree_before=$(git -C "$repo" status --porcelain=v1 --untracked-files=all)

case $provider in
claude)
    command -v claude >/dev/null || { echo 'claude CLI is unavailable' >&2; exit 3; }
    # Headless runs default to the sdk-cli entrypoint, which counts about 2x
    # more against subscription limits. An explicit, honest label replaces it
    # and any value inherited from a parent session; settings.json cannot set it.
    (
        cd -- "$repo"
        CLAUDE_CODE_ENTRYPOINT=lynx-evidence claude -p \
            --model "${EVIDENCE_CLAUDE_MODEL:-opus}" \
            ${EVIDENCE_EFFORT:+--effort "$EVIDENCE_EFFORT"} \
            --strict-mcp-config \
            --tools Read,Grep,Glob,Write,Bash \
            --disallowedTools 'Bash(git commit:*),Bash(git push:*),Bash(git reset:*),Bash(git checkout:*),Bash(git switch:*),Bash(git restore:*),Bash(git stash:*),Bash(git merge:*),Bash(git rebase:*),Bash(gh:*)' \
            --permission-mode bypassPermissions \
            --no-session-persistence \
            <"$brief" >"$output"
    )
    ;;
codex)
    command -v codex >/dev/null || { echo 'codex CLI is unavailable' >&2; exit 3; }
    codex exec \
        ${EVIDENCE_CODEX_MODEL:+-m "$EVIDENCE_CODEX_MODEL"} \
        ${EVIDENCE_EFFORT:+-c "model_reasoning_effort=\"$EVIDENCE_EFFORT\""} \
        -C "$repo" -s danger-full-access --ephemeral \
        -o "$output" - <"$brief" >/dev/null 2>"$output.log" ||
        { printf 'codex exec failed; see %s\n' "$output.log" >&2; exit 4; }
    ;;
*) usage ;;
esac

[[ $(git -C "$repo" rev-parse HEAD) == "$head_before" ]] ||
    { echo 'Evidence agent moved HEAD' >&2; exit 5; }
[[ $(git -C "$repo" status --porcelain=v1 --untracked-files=all) == "$tree_before" ]] ||
    { echo 'Evidence agent changed the working tree; see git status' >&2; exit 5; }
[[ -s $output ]] || { echo 'Evidence agent returned no reply' >&2; exit 4; }
grep -qE '^CLAIM E[0-9]+:' "$output" || { echo 'Evidence agent reply has no CLAIM block' >&2; exit 4; }
