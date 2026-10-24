#!/usr/bin/env bash
# Local TUIOS 0.10.1: list [all|sessions|dirs], connect/preview/kill ROW,
# kill-others, close-others. AGENT/EDITOR are trusted shell commands.
set -Eeuo pipefail

fail() { printf 'tuios-session: %s\n' "$*" >&2; exit 1; }
initializing='' created='' name=''
finish() {
    local status=$?
    trap - EXIT
    if [[ -n $initializing ]]; then
        if [[ $created == yes ]] && tuios kill-session -- "local:$name"; then
            rm -f -- "$initializing"
        else
            printf 'Initialization incomplete; inspect session %q and marker %q before retrying.\n' "$name" "$initializing" >&2
        fi
    fi
    if ((status != 0)); then
        printf 'tuios-session failed (status %s).\n' "$status" >&2
        if [[ -n ${TUIOS_SESSION:-} && -t 0 && -t 1 ]]; then
            read -r -p 'Press Enter to close…' _ </dev/tty || :
        fi
    fi
    exit "$status"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

sessions() {
    local data status
    data=$(tuios ls --json) || { status=$?; ((status == 3)) || return "$status"; }
    # session_commands.go: lsEntry is a SessionInfo array; status 3 is saved-only.
    jq -ce 'if type == "array" and all(.[]; (.name | type == "string") and (.id | type == "string"))
            then . else error("unexpected tuios ls schema") end' <<<"$data"
}
lookup() {
    sessions | jq -ce --argjson s "$1" 'first(.[] | select(.name == $s.name and .id == $s.id))
                                      // error("session changed; refresh the picker")'
}
windows() { tuios list-windows -s "local:$1" --json; }
marker_for() {
    local hash
    hash=$(printf %s "$1" | sha256sum)
    printf '%s/tuios-session/%s.initializing' "${XDG_STATE_HOME:-$HOME/.local/state}" "${hash%% *}"
}
check_initialized() {
    local marker
    marker=$(marker_for "$1")
    [[ ! -e $marker ]] || fail "Interrupted initialization: kill the partial session, then remove $marker before retrying."
}
project_name() {
    local base hash
    base=$(printf %s "${1##*/}" | LC_ALL=C tr -cs 'A-Za-z0-9_-' '-')
    hash=$(printf %s "$1" | sha256sum)
    printf '%s-%s' "${base:0:40}" "${hash:0:16}"
}
label_project() {
    local data label
    data=$(sessions)
    # Saved sessions need an attach before their label can change.
    [[ $(jq -r --arg name "$name" 'any(.[]; .name == $name and .id != "" and (.display_name // "") == "")' <<<"$data") == true ]] || return 0
    label=$(printf %s "${1##*/}" | LC_ALL=C tr -cs 'A-Za-z0-9_.-' '-')
    label=${label:-root}
    if [[ $(jq -r --arg name "$name" --arg label "$label" 'any(.[]; .name != $name and (.display_name // .name) == $label)' <<<"$data") == true ]]; then
        label+="-${name##*-}"
    fi
    tuios set-session-name -s "local:$name" -- "$label"
}
parse_row() {
    local rest token
    kind=${1%%$'\t'*}; rest=${1#*$'\t'}; token=${rest%%$'\t'*}
    payload=$(printf %s "$token" | base64 --decode)
    case $kind in
        session) jq -e 'type == "object" and (.name | type == "string" and length > 0 and (contains("\u0000") | not))
                        and (.id | type == "string")' <<<"$payload" >/dev/null ;;
        directory) jq -e 'type == "object" and (.path | type == "string" and startswith("/") and (contains("\u0000") | not))' <<<"$payload" >/dev/null ;;
        *) fail 'Select a tagged session or directory row.' ;;
    esac
}
list_rows() {
    case $1 in all|sessions|dirs) ;; *) fail 'list expects all, sessions, or dirs' ;; esac
    if [[ $1 != dirs ]]; then
        sessions | jq -r '.[] | ["session", ({name,id} | tojson | @base64), ((.display_name // .name) | tojson)] | join("\t")'
    fi
    if [[ $1 != sessions ]]; then
        local directories directory
        directories=$(zoxide query -l)
        # shortcut: zoxide query is newline-delimited; newline paths need a future NUL-output API.
        while IFS= read -r directory; do
            [[ $directory == /* && -d $directory ]] || continue
            jq -nr --arg path "$directory" '["directory", ({$path} | tojson | @base64), ($path | tojson)] | join("\t")'
        done <<<"$directories"
    fi
}
initialize() {
    local directory=$1 initial editor agent state
    local -a image_env=()
    # shortcut: detached panes lack the host identity; remove when TUIOS refreshes guest environments.
    if [[ -n ${KITTY_WINDOW_ID:-} || ${TERM_PROGRAM:-} == kitty || ${TERM_PROGRAM:-} == ghostty ]]; then
        image_env=(env "PI_IMAGE_PROTOCOL=${PI_IMAGE_PROTOCOL:-kitty}")
    fi
    [[ -n ${AGENT:-} && -n ${EDITOR:-} ]] || fail 'Set AGENT and EDITOR before creating a project.'
    # Let the shell parse trusted command configuration, never directory/selection data.
    sh -c "set -- $AGENT; command -v -- \"\$1\" >/dev/null"
    sh -c "set -- $EDITOR; command -v -- \"\$1\" >/dev/null"
    local marker
    marker=$(marker_for "$name")
    mkdir -p -- "${marker%/*}"
    (set -o noclobber; : >"$marker")
    initializing=$marker
    tuios new --detach --cwd "$directory" -- "$name"
    created=yes
    initial=$(windows "$name" | jq -er 'if (.windows | length) == 1 then .windows[0].window_id else error("expected one initial shell") end')
    editor=$(tuios new-window -s "$name" --workspace 2 --cwd "$directory" --no-focus --print-id -- "" sh -c "exec $EDITOR")
    agent=$(tuios new-window -s "$name" --workspace 1 --cwd "$directory" --print-id -- "" "${image_env[@]}" sh -c "exec $AGENT")
    tuios close-window -s "local:$name" -- "$initial"
    state=$(windows "$name")
    jq -e --arg agent "$agent" --arg editor "$editor" '
        .focused_window_id == $agent and .current_workspace == 1 and (.windows | length) == 2
        and any(.windows[]; .window_id == $agent and .workspace == 1)
        and any(.windows[]; .window_id == $editor and .workspace == 2)' <<<"$state" >/dev/null
    rm -- "$marker"
    initializing='' created=''
}
connect() {
    parse_row "$1"
    if [[ $kind == session ]]; then
        name=$(lookup "$payload" | jq -r '.name')
    else
        local directory lock existing
        IFS= read -r -d '' directory < <(jq -j '.path, "\u0000"' <<<"$payload")
        IFS= read -r -d '' directory < <(realpath -ez -- "$directory")
        [[ -d $directory ]] || fail 'Project directory no longer exists.'
        name=$(project_name "$directory")
        exec {lock}<"$directory"
        flock -x "$lock"
        check_initialized "$name"
        existing=$(sessions | jq -r --arg name "$name" 'any(.[]; .name == $name)')
        if [[ $existing != true ]]; then initialize "$directory"; fi
        label_project "$directory"
        exec {lock}<&-
    fi
    check_initialized "$name"
    if [[ -n ${TUIOS_SESSION:-} || -n ${TUIOS_SOCKET:-} ]]; then
        local args=(switch-session)
        [[ -z ${TUIOS_SESSION:-} ]] || args+=(-s "$TUIOS_SESSION")
        tuios "${args[@]}" -- "local:$name"
    else
        exec tuios attach -- "$name"
    fi
}
preview() {
    parse_row "$1"
    if [[ $kind == session ]]; then
        lookup "$payload" | jq .
    else
        local directory entries
        IFS= read -r -d '' directory < <(jq -j '.path, "\u0000"' <<<"$payload")
        printf 'Project: %s\nWorkspace 1: %s (focused)\nWorkspace 2: %s\n\n' \
            "$(jq '.path' <<<"$payload")" "${AGENT:-unset AGENT}" "${EDITOR:-unset EDITOR}"
        [[ -d $directory ]] || fail 'Project directory no longer exists.'
        shopt -s nullglob dotglob
        entries=("$directory"/*)
        if ((${#entries[@]})); then
            printf '%s\0' "${entries[@]:0:80}" | jq -Rs 'split("\u0000")[:-1][] | split("/")[-1]'
        fi
    fi
}
confirm() {
    local answer
    printf '%s\nUnsaved work will be lost. Type yes to confirm: ' "$1" >/dev/tty
    IFS= read -r answer </dev/tty || return 1
    [[ $answer == yes ]]
}
kill_rows() {
    local targets=$1 snapshot target
    jq -e 'all(.[]; .id != "" and .saved != true)' <<<"$targets" >/dev/null || fail 'Attach saved sessions before killing them.'
    [[ $(jq length <<<"$targets") != 0 ]] || return 0
    while IFS= read -r snapshot; do
        target=$(lookup "$snapshot" | jq -r '.name')
        tuios kill-session -- "local:$target"
    done < <(jq -c '.[]' <<<"$targets")
}
current_session() {
    [[ -n ${TUIOS_SESSION:-} ]] || fail 'Run this command inside a local TUIOS session.'
    sessions | jq -ce --arg name "$TUIOS_SESSION" 'first(.[] | select(.name == $name)) // error("current session changed")'
}
close_others() {
    local current state origin targets live target
    current=$(current_session)
    name=$(jq -r '.name' <<<"$current")
    state=$(windows "$name")
    # A popup can change both focus and workspace: anchor on the command key's original pane.
    origin=$(jq -ce --arg id "${TUIOS_ACTIVE_PANE_ID:-${TUIOS_PANE_ID:-}}" '
        first(.windows[] | select(.window_id == $id and .scratch != true and (.host // "") == "" and (.pty_id // "") != ""))
        // error("original focused terminal is missing or scratch/remote")' <<<"$state")
    targets=$(jq -c --argjson origin "$origin" --arg popup "${TUIOS_PANE_ID:-}" '
        [.windows[] | select(.workspace == $origin.workspace and .window_id != $origin.window_id
        and .window_id != $popup and .scratch != true and (.host // "") == "" and (.pty_id // "") != "")] ' <<<"$state")
    [[ $(jq length <<<"$targets") != 0 ]] || return 0
    confirm "Close other terminals in workspace $(jq '.workspace' <<<"$origin")?$(jq -r '.[] | "\n" + (.display_name | tojson)' <<<"$targets")" || return 0
    lookup "$current" >/dev/null
    live=$(windows "$name")
    jq -e --argjson targets "$targets" --argjson origin "$origin" '
        .windows as $windows | any($windows[]; .window_id == $origin.window_id and .workspace == $origin.workspace)
        and all($targets[]; . as $t | any($windows[]; .window_id == $t.window_id
            and .workspace == $origin.workspace and .scratch != true and (.host // "") == ""))' <<<"$live" >/dev/null
    while IFS= read -r target; do
        tuios close-window -s "local:$name" -- "$target"
    done < <(jq -r '.[].window_id' <<<"$targets")
}

[[ -z ${TUIOS_SESSION_REMOTE:-} ]] || fail 'Only local sessions are supported.'
case ${1:-} in
    list) list_rows "${2:-all}" ;;
    connect) [[ $# == 2 ]] || fail 'connect requires one row'; connect "$2" ;;
    preview) [[ $# == 2 ]] || fail 'preview requires one row'; preview "$2" ;;
    kill)
        [[ $# == 2 ]] || fail 'kill requires one row'
        parse_row "$2"
        [[ $kind == session ]] || fail 'Directories cannot be killed or deleted.'
        target=$(lookup "$payload"); kill_rows "[$target]" ;;
    kill-others)
        current=$(current_session)
        targets=$(sessions | jq -c --argjson current "$current" '[.[] | select(.id != $current.id)]')
        if [[ $(jq length <<<"$targets") != 0 ]] &&
            confirm "Kill these sessions?$(jq -r '.[] | "\n" + (.name | tojson)' <<<"$targets")"; then
            kill_rows "$targets"
        fi ;;
    close-others) close_others ;;
    *) fail 'Usage: tuios-session list [all|sessions|dirs] | connect/preview/kill ROW | kill-others | close-others' ;;
esac
