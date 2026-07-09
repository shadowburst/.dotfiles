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

is_worktrunk_shortcut() {
  case $1 in
    '^' | '-' | *:*) return 0 ;;
    *) return 1 ;;
  esac
}

name=$(
  tv \
    --source-command 'printf "%s\n" "+ create branch / enter worktrunk shortcut" "^" "-"; wt list --format=json 2>/dev/null | jq -r '\''.[] | select(.branch != null) | .branch'\''' \
    --source-output '{}' \
    --preview-command 'case "{}" in "+ create"*) printf "%s\n" "Create a branch, or enter a worktrunk shortcut such as pr:123." ;; "^") printf "%s\n" "Switch to the default branch." ;; "-") printf "%s\n" "Switch to the previous branch." ;; *) git show -p --stat --pretty=fuller --color=always "{}" 2>/dev/null || true ;; esac' \
    --input-prompt='worktree > ' \
    --input-header='enter switches; + prompts for a new branch or worktrunk shortcut' \
    --no-remote \
    --hide-help-panel \
    --inline
)
[[ -z $name ]] && exit 0

if [[ $name == '+ create branch / enter worktrunk shortcut' ]]; then
  printf 'Branch or worktrunk shortcut: '
  read -r name
  [[ -z $name ]] && exit 0
fi

if is_worktrunk_shortcut "$name" || git show-ref --quiet --verify "refs/heads/$name"; then
  wtargs=(switch "$name")
else
  wtargs=(switch --create "$name")
fi

if ! result=$(wt "${wtargs[@]}" --no-cd --format=json); then
  printf '\n\033[31m%s\033[0m press any key to close' "wt switch failed."
  read -r -n1
  exit 1
fi

wtpath=$(printf '%s\n' "$result" | jq -r '.path // empty' 2>/dev/null)
if [[ -z $wtpath ]]; then
  wtpath=$(
    wt list --format=json 2>/dev/null \
      | jq -r --arg branch "$name" 'first(.[] | select(.branch == $branch and .kind == "worktree") | .path) // empty'
  )
fi
[[ -z $wtpath ]] && fail "worktrunk returned no worktree path for: $name"

herdr=${HERDR_BIN_PATH:-herdr}
root_ws=$(
  "$herdr" worktree list --cwd "$PWD" --json 2>/dev/null \
    | jq -r '.result.source.source_workspace_id // empty'
)
[[ -z $root_ws ]] && root_ws=${HERDR_WORKSPACE_ID:-}
[[ -z $root_ws ]] && fail "could not resolve the root Herdr workspace"

exec "$herdr" worktree open --workspace "$root_ws" \
  --path "$wtpath" --label "$name" --focus --json
