#!/usr/bin/env bash
set -u

fail() {
  printf '\033[31m%s\033[0m\n' "$1"
  sleep 2
  exit 1
}

for bin in git jq tv wt; do
  command -v "$bin" >/dev/null || fail "$bin not found on PATH"
done

herdr=${HERDR_BIN_PATH:-herdr}
wtjson=$(wt list --format=json 2>/dev/null) || fail "wt list failed"

cands=$(printf '%s\n' "$wtjson" | jq -r '.[] | select(.branch != null and .is_main != true) | .branch')
if [[ -z $cands ]]; then
  printf '\033[33m%s\033[0m\n' "No removable worktrees."
  sleep 2
  exit 0
fi

name=$(
  tv \
    --source-command 'wt list --format=json 2>/dev/null | jq -r '\''.[] | select(.branch != null and .is_main != true) | .branch'\''' \
    --source-output '{}' \
    --preview-command 'wt list --format=json 2>/dev/null | jq -r --arg branch "{}" '\''.[] | select(.branch == $branch) | .path'\'' | while read -r path; do [ -n "$path" ] && cd "$path" && git log --oneline -10 --color=always && printf "\n" && git status --short; done' \
    --input-prompt='remove worktree > ' \
    --input-header='enter removes; worktrunk will ask for confirmation' \
    --no-remote \
    --hide-help-panel \
    --inline
)
[[ -z $name ]] && exit 0

wtpath=$(printf '%s\n' "$wtjson" | jq -r --arg branch "$name" 'first(.[] | select(.branch == $branch) | .path) // empty')
wsid=$(
  "$herdr" worktree list --cwd "$PWD" --json 2>/dev/null \
    | jq -r --arg path "$wtpath" 'first(.result.worktrees[] | select(.path == $path) | .open_workspace_id) // empty'
)

if ! wt remove --foreground "$name"; then
  printf '\n\033[31m%s\033[0m press any key to close' "wt remove failed."
  read -r -n1
  exit 0
fi

if [[ -n $wsid ]]; then
  "$herdr" workspace close "$wsid"
elif [[ -n $wtpath && $wtpath != "/" ]]; then
  "$herdr" pane list 2>/dev/null \
    | jq -r --arg path "$wtpath" --arg self "${HERDR_PANE_ID:-}" \
      '.result.panes[] | select(.pane_id != $self) | select(.cwd == $path or (.cwd | startswith($path + "/"))) | .pane_id' \
    | while read -r pane_id; do
      "$herdr" pane close "$pane_id"
    done
fi
