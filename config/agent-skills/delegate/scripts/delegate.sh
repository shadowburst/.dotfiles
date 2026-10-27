#!/usr/bin/env bash
# Coordination, not a security boundary. Edit tasks have full host permissions.
# jq filters passed to update must remain literal.
# shellcheck disable=SC2016
set -Eeuo pipefail
shopt -s inherit_errexit
umask 077
SCRIPT=$(realpath -- "${BASH_SOURCE[0]}")
MAIN_PID=$BASHPID
record='' task='' command='' lockfd=''

help() {
    printf '%s\n' \
        'Usage: delegate.sh start --harness codex|claude|pi|opencode --prompt-file FILE' \
        '                         [--cwd DIR] [--model MODEL] [--effort EFFORT]' \
        '                         [--edit --commit SHA --allow-full-permissions]' \
        '       delegate.sh status|cancel|cleanup TASK_ID' \
        '       delegate.sh wait TASK_ID [--timeout SECONDS]' \
        '       delegate.sh follow-up TASK_ID --prompt-file FILE' \
        'Requires Herdr caller context, Bash, jq, flock, GNU coreutils, Git and Linux /proc.' \
        'JSON output. No automatic retries. Records are private temporary files.' \
        'Model and effort use native values; omit them to keep native defaults.' \
        'Edit permission bypass applies to the entire host. Worktrees and branches persist.'
}
die() { error "$*"; }
error() {
    local code=$? message="${1:-Command failed: $BASH_COMMAND}"
    trap - ERR
    if [[ $command == start && $BASHPID == "$MAIN_PID" && -n $task && -f $record ]]; then
        task=$(jq -c --arg error "$message" '.state="failed" | .error=$error' <<< "$task")
        save
        view
        exit 0
    fi
    jq -cn --arg error "$message" '{error:$error}' >&2
    exit "$((code == 0 ? 1 : code))"
}
trap 'error' ERR

atomic() {
    local path=$1 value=$2 tmp
    tmp=$(mktemp "${path%/*}/.write-XXXXXXXX")
    printf '%s\n' "$value" > "$tmp"
    mv -T -- "$tmp" "$path"
}
save() { atomic "$record" "$task"; }
update() { task=$(jq -c "$@" <<< "$task"); save; }
load() {
    [[ -f $record ]] || die "Missing record: $record. No task was restarted."
    task=$(<"$record")
    jq -e 'type == "object"' <<< "$task" >/dev/null
}
field() { jq -r "$1 // empty" <<< "$task"; }
hash() { sha256sum | cut -c1-24; }
uuid() { tr -d '\n-' < /proc/sys/kernel/random/uuid; }
private_dir() {
    local path=$1 owner mode
    mkdir -p -- "$path"
    read -r owner mode < <(stat -c '%u %a' -- "$path")
    [[ -d $path && ! -L $path && $owner == "$UID" && $((8#$mode & 077)) == 0 ]] || die "Not a private owned directory: $path"
}
lock() { exec {lockfd}>>"$lockfile"; flock -x "$lockfd"; }
unlock() { exec {lockfd}>&-; lockfd=; }
herdr_json() {
    local output
    output=$(timeout 30 herdr "$@") || return
    if [[ -z $output && $1 == pane && $2 == run ]]; then
        printf '{}\n'
    else
        jq -ce 'if type == "object" and (has("error") | not) and has("result") then .result else error("Herdr error: \(.)") end' <<< "$output" || return
    fi
}
git_at() { git -C "$1" "${@:2}"; }
turn_path() { printf '%s/turn-%04d' "${record%/*}" "$(field '.turn')"; }

# Stable Linux identity: do not use $$, which names the parent in subshells.
identity() {
    local pid=$1 statline boot uid cmdline
    local -a fields
    [[ -r /proc/$pid/stat && -r /proc/$pid/cmdline ]] || return 1
    IFS= read -r statline < "/proc/$pid/stat" || return 1
    read -r -a fields <<< "${statline##*) }"
    [[ ${#fields[@]} -ge 20 ]] || return 1
    IFS= read -r boot < /proc/sys/kernel/random/boot_id
    uid=$(stat -c %u "/proc/$pid") || return 1
    cmdline=$(jq -Rsc 'split("\u0000")[:-1]' "/proc/$pid/cmdline") || return 1
    jq -cn --argjson pid "$pid" --arg start "${fields[19]}" --argjson pgrp "${fields[2]}" \
        --argjson session "${fields[3]}" --argjson tty "${fields[4]}" --argjson foreground "${fields[5]}" \
        --argjson uid "$uid" --arg boot "$boot" --argjson cmdline "$cmdline" --arg state "${fields[0]}" \
        '{pid:$pid,start:$start,pgrp:$pgrp,session:$session,tty:$tty,foreground:$foreground,uid:$uid,boot:$boot,cmdline:$cmdline,zombie:($state=="Z")}'
}
worker_alive() {
    local owned current pid
    owned=$(field '.worker')
    [[ -n $owned ]] || return 1
    pid=$(jq -r .pid <<< "$owned")
    current=$(identity "$pid") || return 1
    jq -e --argjson current "$current" --argjson uid "$UID" --arg token "$(field '.token')" \
        '. == $current and .uid == $uid and (.zombie | not) and .pid == .pgrp and .tty != 0 and .foreground == .pgrp
         and (.cmdline | index("_worker") != null) and (.cmdline | index($token) != null)' <<< "$owned" >/dev/null
}
task_processes_alive() {
    local pid session path statline other entry marker
    local -a fields
    pid=$(field '.worker.pid'); session=$(field '.worker.session')
    [[ -n $pid ]] || return 1
    marker=HERDR_DELEGATE_ACTIVE=$(field '.id')
    for path in /proc/[0-9]*/stat; do
        other=${path%/stat}; other=${other##*/}
        [[ $other != "$pid" ]] || continue
        # Builtins only: this scan must not see its own inspection subprocesses.
        if { IFS= read -r statline < "$path"; } 2>/dev/null; then
            read -r -a fields <<< "${statline##*) }"
            [[ ${fields[0]} != Z ]] || continue
            if [[ ${fields[2]} == "$pid" && ${fields[3]} == "$session" ]]; then
                return 0
            fi
            # shortcut: detached processes must retain the task marker, use a cgroup if enforced containment is needed.
            if { while IFS= read -r -d '' entry; do
                if [[ $entry == "$marker" ]]; then return 0; fi
            done < "${path%/stat}/environ"; } 2>/dev/null; then :; fi
        fi
    done
    return 1
}
require_worker() {
    local pane info
    worker_alive || die 'Owned foreground supervisor cannot be verified; leave resources unchanged.'
    pane=$(herdr_json pane get "$(field '.pane_id')")
    jq -e --argjson task "$task" '.pane.tab_id == $task.context.HERDR_TAB_ID and .pane.terminal_id == $task.terminal_id' <<< "$pane" >/dev/null || die 'Created pane identity changed; leave it unchanged.'
    info=$(herdr_json pane process-info --pane "$(field '.pane_id')")
    jq -e --argjson pid "$(field '.worker.pid')" '.process_info.foreground_process_group_id == $pid' <<< "$info" >/dev/null || die 'Owned supervisor is not the foreground process; leave the pane unchanged.'
    worker_alive || die 'Supervisor identity changed.'
    if [[ ${1:-idle} == idle ]] && task_processes_alive; then
        die 'Other live task processes remain; leave resources unchanged.'
    fi
}
view() {
    local data=$task state result directory
    state=$(field '.state'); directory=$(turn_path); result=$directory/result.json
    if [[ $state != cleaned ]] && { [[ -n $(field '.worker') || $state == running || $state == cancelling ]]; }; then
        if ! worker_alive; then
            data=$(jq -c '.state="unknown" | .error="Worker identity is no longer live; inspect preserved artifacts."' <<< "$data")
        fi
    elif [[ $state == queued ]] && jq -e '.launch_error != null or (now - .queued_at > 30)' <<< "$task" >/dev/null; then
        data=$(jq -c '.state="unknown" | .error="Worker launch was not confirmed. Do not retry pane run."' <<< "$data")
    fi
    if [[ -f $result || $state == 'done' ]]; then
        data=$(jq -c --slurpfile result "$result" '.result=$result[0]' <<< "$data")
    fi
    jq -c --arg result "$result" --arg original "${record%/*}/turn-0000/result.json" \
        'del(.token) | .result_path=$result | .original_result_path=$original' <<< "$data"
}
prepare_turn() {
    local directory
    directory=$(turn_path)
    mkdir -m 700 -- "$directory"
    {
        printf '%s\n' 'Work on this task yourself. Do not create, invoke, or delegate to any child' \
            'agent, subagent, Agent/Task tool, or delegation helper. Do not control Herdr.' \
            'Use only the task below and local project instructions, not parent history.' \
            'The parent will integrate your changes. Keep all task artifacts intact.'
        if [[ $(field '.edit') == true ]]; then
            printf '%s\n' 'Editing is authorized with full permission bypass. Work only in your task worktree; commit your changes on its branch. Do not merge into the parent branch.'
        else
            printf '%s\n' 'This is a read-only task. Do not change files or repository state.'
        fi
        printf '\nTASK\n%s\n' "$prompt"
    } > "$directory/prompt.txt"
    update '.state="queued" | .queued_at=now | .launch_error=null'
}
make_worktree() {
    local repo resolved root worktree relative parent
    parent=$(field '.parent_cwd')
    repo=$(git_at "$parent" rev-parse --show-toplevel); repo=$(realpath -- "$repo")
    resolved=$(git_at "$repo" rev-parse --verify --end-of-options "$commit^{commit}")
    root=$repo/.worktrees
    if ! git_at "$repo" check-ignore -q -- "$root/probe"; then
        root=$HOME/.local/share/herdr-delegate/worktrees/$(printf '%s' "$repo" | hash)
    fi
    mkdir -p -- "$root"
    worktree=$root/$(field '.id')
    update --arg repo "$repo" --arg wt "$worktree" --arg branch "delegate/$(field '.id')" --arg commit "$resolved" \
        '.repo=$repo | .worktree=$wt | .branch=$branch | .commit=$commit'
    git_at "$repo" worktree add -b "$(field '.branch')" "$worktree" "$resolved" >&2
    relative=$(realpath --relative-to="$repo" -- "$parent")
    [[ $relative != .. && $relative != ../* ]] || die 'cwd is outside the repository.'
    [[ -d $worktree/$relative ]] || die 'The original cwd does not exist at the selected commit.'
    update --arg cwd "$(realpath -- "$worktree/$relative")" '.cwd=$cwd'
}
start() {
    local layout target direction id pane launch_command output
    prompt=$(<"$prompt_file")
    [[ $prompt == *[![:space:]]* ]] || die 'Prompt file is empty.'
    if $edit; then
        [[ -n $commit && $allow == true ]] || die 'Editing requires --commit and --allow-full-permissions.'
    else
        [[ -z $commit && $allow == false ]] || die '--commit and --allow-full-permissions require --edit.'
    fi
    cwd=$(realpath -e -- "$cwd"); [[ -d $cwd ]] || die '--cwd must be a directory.'
    layout=$(herdr_json pane layout --pane "$HERDR_PANE_ID")
    target=$(jq -cer --arg caller "$HERDR_PANE_ID" --arg tab "$HERDR_TAB_ID" '
        .layout | if .tab_id != $tab then error("Caller tab context changed") elif .zoomed then error("Unzoom the caller tab") else . end |
        .panes as $panes | ([$panes[] | select(.pane_id==$caller)][0] // error("Caller missing from layout")) as $current |
        [$panes[] | select(.rect.x >= ($current.rect.x+$current.rect.width))] as $right |
        (if ($right|length)>0 then {pane:($right | max_by([(.rect.x+.rect.width),(.rect.y+.rect.height)])),direction:"down"}
         else {pane:$current,direction:"right"} end) |
        if .pane.rect.width < (if .direction=="right" then 121 else 60 end) or .pane.rect.height < (if .direction=="down" then 25 else 12 end)
        then error("Insufficient pane space: each half needs 60 columns and 12 rows") else [.pane.pane_id,.direction] | @tsv end' <<< "$layout")
    IFS=$'\t' read -r target direction <<< "$target"
    id=$(uuid); mkdir -m 700 -- "$base/$id"; record=$base/$id/record.json
    task=$(jq -cn --arg id "$id" --arg record "$record" --arg token "$(uuid)" --argjson context "$context" \
        --arg harness "$harness" --arg model "$model" --arg effort "$effort" --argjson edit "$edit" --arg cwd "$cwd" \
        '{id:$id,record:$record,token:$token,context:$context,harness:$harness,model:(if $model=="" then null else $model end),effort:(if $effort=="" then null else $effort end),edit:$edit,parent_cwd:$cwd,cwd:$cwd,turn:0,state:"failed",pane_id:null}')
    save
    if [[ $harness == opencode && ${OPENCODE_CONFIG_CONTENT+x} ]]; then
        atomic "${record%/*}/opencode-config.json" "$OPENCODE_CONFIG_CONTENT"
    fi
    if $edit; then make_worktree; fi
    pane=$(herdr_json pane split --pane "$target" --direction "$direction" --cwd "$(field '.cwd')" --no-focus)
    update --argjson pane "$pane" '.pane_id=$pane.pane.pane_id | .terminal_id=$pane.pane.terminal_id'
    if [[ -z $(field '.terminal_id') ]] || ! jq -e '.pane.tab_id' <<< "$pane" >/dev/null; then
        pane=$(herdr_json pane get "$(field '.pane_id')")
        update --argjson pane "$pane" '.terminal_id=$pane.pane.terminal_id'
    fi
    jq -e --arg tab "$HERDR_TAB_ID" '.pane.tab_id==$tab and (.pane.terminal_id | type=="string")' <<< "$pane" >/dev/null || die 'Created pane is outside caller tab or has no terminal identity; no worker launched.'
    prepare_turn
    # exec replaces the pane shell. The worker verifies group leader and TTY ownership.
    printf -v launch_command 'exec bash %q _worker %q %q %q' "$SCRIPT" "$record" "$(field '.token')" "$(field '.turn')"
    if output=$(herdr_json pane run "$(field '.pane_id')" "$launch_command" 2>&1); then :; else
        update --arg error "$output" '.launch_error=$error'
    fi
    view
}
cleanup() {
    local state wt repo parent_head head
    state=$(view | jq -r .state)
    [[ $state != cleaned ]] || { view; return; }
    [[ $state == 'done' || $state == failed || $state == cancelled ]] || die 'Refusing cleanup: task is running or uncertain. Cancel it first.'
    if task_processes_alive; then die 'Other live task processes remain; refusing cleanup.'; fi
    if [[ -n $(field '.pane_id') ]]; then require_worker; fi
    wt=$(field '.worktree'); repo=$(field '.repo')
    if [[ -n $wt && -e $wt ]]; then
        [[ $(realpath -- "$(git_at "$wt" rev-parse --show-toplevel)") == "$(realpath -- "$wt")" ]] || die 'Worktree root changed; refusing removal.'
        [[ $(git_at "$wt" symbolic-ref --short HEAD) == "$(field '.branch')" ]] || die 'Worktree branch changed; refusing removal.'
        [[ -z $(git_at "$wt" status --porcelain --untracked-files=all --ignored) ]] || die 'Refusing cleanup of dirty, untracked or ignored worktree files.'
        parent_head=$(git_at "$(field '.parent_cwd')" rev-parse HEAD); head=$(git_at "$wt" rev-parse HEAD)
        git_at "$repo" merge-base --is-ancestor "$head" "$parent_head" || die 'Worktree history is not integrated into parent current HEAD.'
        if [[ -n $(field '.pane_id') ]]; then require_worker; fi
        git_at "$repo" worktree remove -- "$wt"
    fi
    if [[ -n $(field '.pane_id') ]]; then
        require_worker
        herdr_json pane close "$(field '.pane_id')" >/dev/null
    fi
    update '.pane_closed=true | .state="cleaned"'
    view
}

validate_harness() {
    local harness=$1 effort=$2 model=${3:-}
    command -v "$harness" >/dev/null || die "Missing harness executable: $harness"
    if [[ $harness == opencode && -n $model ]]; then
        local base_model=${model%%#*}
        [[ $base_model == */* && -n ${base_model%%/*} && -n ${base_model#*/} ]] || die 'opencode --model requires provider/model.'
        [[ -z $effort || $model != *#* ]] || die 'opencode --model with #variant cannot be combined with --effort.'
    fi
    case $harness:$effort in
        codex:*|opencode:*) ;; # Native model-specific strings, not a shared enum.
        claude:|claude:low|claude:medium|claude:high|claude:xhigh|claude:max) ;;
        pi:|pi:off|pi:minimal|pi:low|pi:medium|pi:high|pi:xhigh|pi:max) ;;
        *) die "Unsupported effort for $harness: $effort" ;;
    esac
}
argv_for() {
    local harness model effort session agent config metadata
    harness=$(field '.harness'); model=$(field '.model'); effort=$(field '.effort'); session=$(field '.session_id')
    case $harness in
        codex)
            argv=(codex exec)
            if [[ -n $session ]]; then argv+=(resume); fi
            argv+=(--json --skip-git-repo-check --disable multi_agent --disable multi_agent_v2
                -c 'shell_environment_policy.inherit="all"' -c 'approval_policy="never"' --output-last-message "$directory/response.txt")
            if [[ $(field '.edit') == true ]]; then argv+=(--dangerously-bypass-approvals-and-sandbox)
            else argv+=(-c 'sandbox_mode="read-only"'); fi
            if [[ -n $effort ]]; then argv+=(-c "model_reasoning_effort=$(jq -cn --arg effort "$effort" '$effort')"); fi ;;
        claude)
            argv=(claude --print --verbose --output-format stream-json --disallowedTools 'Agent,Task' --permission-prompts none)
            if [[ $(field '.edit') == true ]]; then argv+=(--dangerously-skip-permissions)
            else argv+=(--permission-mode plan --tools 'Read,Glob,Grep' --strict-mcp-config --mcp-config '{}'); fi
            if [[ -n $effort ]]; then argv+=(--effort "$effort"); fi ;;
        pi)
            argv=(pi --print --mode json --no-extensions --no-mcp --no-skills --no-prompt-templates --no-approve
                --session-dir "${record%/*}/pi-sessions")
            if [[ $(field '.edit') == true ]]; then argv+=(--tools 'read,bash,edit,write')
            else argv+=(--tools 'read,grep,find,ls'); fi
            if [[ -n $effort ]]; then argv+=(--thinking "$effort"); fi ;;
        opencode)
            local -x HERDR_DELEGATE_ACTIVE
            HERDR_DELEGATE_ACTIVE=$(field '.id')
            agent=delegate_$HERDR_DELEGATE_ACTIVE
            config=${OPENCODE_CONFIG_CONTENT:-'{}'}
            if [[ -f ${record%/*}/opencode-config.json ]]; then config=$(<"${record%/*}/opencode-config.json"); config=${config:-'{}'}; fi
            # Keep inherited provider credentials out of process arguments.
            OPENCODE_CONFIG_CONTENT=$(jq -ce --arg agent "$agent" --argjson edit "$(jq -c .edit <<< "$task")" '
                if type!="object" then error("OPENCODE_CONFIG_CONTENT must be a JSON object") else . end |
                . * {experimental:{subagent_depth:0},agents:{($agent):{mode:"primary",permissions:
                    (if $edit then [{action:"*",resource:"*",effect:"allow"},{action:"subagent",resource:"*",effect:"deny"},{action:"question",resource:"*",effect:"deny"}]
                     else [{action:"*",resource:"*",effect:"deny"},{action:"read",resource:"*",effect:"allow"},{action:"glob",resource:"*",effect:"allow"},{action:"grep",resource:"*",effect:"allow"},{action:"external_directory",resource:"*",effect:"allow"}] end)}}}' <<< "$config")
            export OPENCODE_CONFIG_CONTENT
            if [[ -n $session ]]; then
                metadata=$(timeout --foreground 30 opencode api --standalone session.get --param "sessionID=$session")
                jq -e --arg session "$session" '.data.id==$session' <<< "$metadata" >/dev/null
            fi
            if [[ -z $model && -n $effort ]]; then
                model=$(field '.resolved_model')
                if [[ -z $model ]]; then
                    metadata=$(timeout --foreground 30 opencode api --standalone model.default --param "location[directory]=$PWD")
                    model=$(jq -er '.data | select((.providerID|type)=="string" and (.providerID|length)>0 and (.id|type)=="string" and (.id|length)>0) | .providerID+"/"+.id' <<< "$metadata")
                    if [[ $effort != default ]]; then model+="#$effort"; fi
                    lock; load; update --arg model "$model" '.resolved_model=$model'; unlock
                fi
            elif [[ -n $model && -n $effort && $effort != default ]]; then
                model+="#$effort"
            fi
            argv=(opencode run --standalone --format json --agent "$agent") ;;
        *) die "Unsupported harness: $harness" ;;
    esac
    if [[ -n $model ]]; then argv+=(--model "$model"); fi
    case $harness in
        codex) if [[ -n $session ]]; then argv+=("$session"); fi; argv+=(-) ;;
        claude) if [[ -n $session ]]; then argv+=(--resume "$session"); fi ;;
        pi) if [[ -n $session ]]; then argv+=(--session "$session"); else argv+=(--session-id "$(field '.id')"); fi ;;
        opencode) if [[ -n $session ]]; then argv+=(--session "$session"); fi ;;
    esac
}
parse_result() {
    local directory=$1 cli_status=$2 tee_status=$3 result
    # Parse JSON lines independently: diagnostics and malformed lines are not events.
    result=$(jq -Rnc --arg harness "$(field '.harness')" --arg session "$(field '.session_id')" \
        --argjson exit_code "$cli_status" --argjson tee_status "$tee_status" '
        reduce (inputs | fromjson? | select(type=="object")) as $e
        ({exit_code:$exit_code,response:"",complete:false,session_id:(if $session=="" or $harness=="pi" or $harness=="opencode" then null else $session end)};
          if $harness=="codex" then
            if $e.type=="thread.started" and ($e.thread_id|type)=="string" then .session_id=$e.thread_id
            elif $e.type=="item.completed" and $e.item.type=="agent_message" then .response=($e.item.text // "")
            elif $e.type=="turn.completed" then .complete=true
            elif $e.type=="turn.failed" then .complete=false | .error=($e.error // "Codex turn failed") else . end
          elif $harness=="claude" then
            (if ($e.session_id|type)=="string" and $e.session_id!="" then .session_id=$e.session_id else . end) |
            if $e.type=="result" then .complete=($e.subtype=="success" and ($e.is_error|not)) | .response=($e.result // "") |
              if .complete then . else .error=$e end else . end
          elif $harness=="pi" then
            if $e.type=="session" and ($e.id|type)=="string" then .session_id=$e.id
            elif $e.type=="agent_start" then .complete=false | .stop_reason=null | .response="" | del(.error)
            elif $e.type=="message_end" and $e.message.role=="assistant" then
              .complete=false | .stop_reason=$e.message.stopReason |
              .response=([$e.message.content[]? | select(.type=="text" and (.text|type)=="string") | .text] | join("\n")) |
              del(.error) | if .stop_reason=="stop" then . else .error=($e.message.errorMessage // ("Pi assistant stopped: " + (.stop_reason // "unknown"))) end
            elif $e.type=="agent_settled" then
              .complete=($e.aborted==false and .stop_reason=="stop") |
              if $e.aborted!=false then .error="Pi run did not settle without aborting." else . end
            else . end
          elif $harness=="opencode" then
            (if ($e.sessionID|type)=="string" and $e.sessionID!="" then .session_id=$e.sessionID else . end) |
            if $e.type=="text" and ($e.part.id|type)=="string" and ($e.part.messageID|type)=="string" and ($e.part.text|type)=="string" then
              .parts[$e.part.id]={message_id:$e.part.messageID,text:$e.part.text} |
              if .message_id!=$e.part.messageID then .complete=false else . end
            elif $e.type=="step_finish" then .message_id=$e.part.messageID | .complete=($e.part.reason=="stop" and (.message_id|type)=="string")
            elif $e.type=="error" then .error=($e.error // "opencode run failed")
            else . end
          else error("Unsupported harness: \($harness)") end)
        | if $harness=="opencode" then . as $r | .response=([.parts[]? | select(.message_id==$r.message_id) | .text] | join("\n")) | del(.parts) else . end
        | if $tee_status!=0 then .error="Event log pipeline failed." else . end' "$directory/stream.jsonl")
    if [[ $(field '.harness') == codex && -f $directory/response.txt ]]; then
        result=$(jq -c --rawfile response "$directory/response.txt" '.response=$response' <<< "$result")
    fi
    printf '%s\n' "$result"
}
execute_turn() {
    local directory runner cancelled=false cli_status tee_status result state
    local -a argv
    directory=$(turn_path)
    trap 'cancelled=true' TERM
    update '.state="running"'
    : > "$directory/stream.jsonl"
    # The CLI branch confirms admission before the parent can signal the group.
    # Both shells reap their children after TERM; neither returns to a pane shell.
    (
        trap ':' TERM
        trap - ERR
        set +e
        exec {lockfd}>&-
        cd -- "$(field '.cwd')" || exit 125
        child_id=$(field '.id')
        (
            trap - TERM
            set -e
            unset CLAUDECODE CLAUDE_CODE_ENTRYPOINT PI_SESSION_ID CODEX_THREAD_ID OPENCODE_SESSION_ID
            : > "$directory/admitted"
            # Native preflight errors must fail the turn, not the supervisor.
            argv_for
            exec env HERDR_DELEGATE_ACTIVE="$child_id" "${argv[@]}"
        ) < "$directory/prompt.txt" 2> "$directory/stderr.log" | tee "$directory/stream.jsonl"
        statuses=("${PIPESTATUS[@]}")
        printf '%s %s\n' "${statuses[0]}" "${statuses[1]}" > "$directory/exit-status"
        while IFS= read -r line || [[ -n $line ]]; do printf '%s\n' "$line" >&2; done < "$directory/stderr.log"
    ) &
    runner=$!
    while [[ ! -e $directory/admitted ]] && kill -0 "$runner" 2>/dev/null; do sleep 0.01; done
    unlock
    while kill -0 "$runner" 2>/dev/null; do wait "$runner" || :; done
    wait "$runner" 2>/dev/null || :
    trap ':' TERM
    lock
    load
    cli_status=null; tee_status=1
    if [[ -f $directory/exit-status ]]; then read -r cli_status tee_status < "$directory/exit-status"; fi
    result=$(parse_result "$directory" "$cli_status" "$tee_status")
    state=failed
    if jq -e '.exit_code==0 and .complete==true and (.response|type)=="string" and (.response|length)>0 and (.session_id|type)=="string" and (.session_id|length)>0 and (has("error")|not)' <<< "$result" >/dev/null; then
        state='done'
    else
        result=$(jq -c '.error //= "CLI failed or returned no complete response/session ID."' <<< "$result")
    fi
    if $cancelled || [[ $(field '.state') == cancelling ]]; then
        state=cancelled; result=$(jq -c '.error="Cancelled by parent."' <<< "$result")
    fi
    [[ ! -e $directory/result.json ]] || die 'Refusing to overwrite an immutable turn result.'
    result=$(jq -c --arg state "$state" '.state=$state | .finished_at=now' <<< "$result")
    atomic "$directory/result.json" "$result"
    update --arg state "$state" --argjson result "$result" '.state=$state | if $result.session_id then .session_id=$result.session_id else . end'
}
worker() {
    local token=$2 turn=$3 pid=$BASHPID owned snapshot timer
    record=$(realpath -e -- "$1")
    base=${record%/*}; base=${base%/*}
    private_dir "${base%/*}"; private_dir "$base"; private_dir "${record%/*}"
    context=$(<"$base/context.json")
    lockfile=${base%/*}/$(jq -cS 'del(.HERDR_PANE_ID)' <<< "$context" | hash).lock
    trap ':' TERM
    # No job control: CLI, tee and the runner must stay in the owned group.
    set +m
    lock; load
    jq -e --arg token "$token" --argjson turn "$turn" --arg pane "$HERDR_PANE_ID" \
        '.token==$token and .turn==$turn and (.state=="queued" or .state=="cancelled") and .worker==null and .pane_id==$pane' <<< "$task" >/dev/null || die 'Supervisor admission was revoked, claimed, or in another pane.'
    owned=$(identity "$pid")
    update --argjson owned "$owned" '.worker=$owned'
    require_worker active
    mkfifo -m 600 -- "${record%/*}/timer"
    exec {timer}<>"${record%/*}/timer"
    while :; do
        [[ $(field '.token') == "$token" && $(field '.worker') == "$(jq -r . <<< "$owned")" ]] || die 'Supervisor ownership changed.'
        case $(field '.state') in
            cleaned) unlock; return ;;
            queued) execute_turn ;;
        esac
        unlock
        # A FIFO read is a builtin timer. No sleeping child can look like CLI work
        # during parent ownership checks. Read the atomic record with builtins too.
        while :; do
            read -r -t 0.2 -u "$timer" _ || :
            IFS= read -r snapshot < "$record"
            [[ $snapshot == "$task" ]] || break
        done
        lock; load
    done
}

main() {
    local harness='' prompt_file='' cwd=$PWD model='' effort='' edit=false commit='' allow=false timeout_value='' timeout_set=false task_id='' prompt='' context base lockfile deadline='' data state
    command=${1:-}; if [[ $command == --help || $command == -h ]]; then help; return; fi
    [[ -n $command ]] || { help >&2; return 1; }; shift
    if [[ $command == _worker ]]; then
        [[ ${HERDR_ENV:-} == 1 && ! ${HERDR_DELEGATE_ACTIVE+x} && $# == 3 ]] || die 'Invalid worker environment.'
        worker "$@"; return
    fi
    case $command in start|status|wait|cancel|follow-up|cleanup) ;; *) die "Unknown command: $command" ;; esac
    while (($#)); do
        case $1 in
            --help|-h) help; return ;;
            --harness|--prompt-file|--cwd|--model|--effort|--commit|--timeout)
                (($# >= 2)) || die "Missing value for $1"
                case $1 in
                    --harness|--cwd|--model|--effort|--commit) [[ $command == start ]] || die "Invalid option: $1" ;;
                    --prompt-file) [[ $command == start || $command == follow-up ]] || die "Invalid option: $1" ;;
                    --timeout) [[ $command == wait ]] || die "Invalid option: $1" ;;
                esac
                if [[ $1 == --model || $1 == --effort ]]; then [[ -n $2 ]] || die "$1 must not be empty."; fi
                case $1 in
                    --harness) harness=$2 ;; --prompt-file) prompt_file=$2 ;; --cwd) cwd=$2 ;; --model) model=$2 ;; --effort) effort=$2 ;; --commit) commit=$2 ;; --timeout) timeout_value=$2; timeout_set=true ;;
                esac; shift 2 ;;
            --edit|--allow-full-permissions)
                [[ $command == start ]] || die "Invalid option: $1"
                if [[ $1 == --edit ]]; then edit=true; else allow=true; fi; shift ;;
            -*) die "Unknown option: $1" ;;
            *) [[ $command != start && -z $task_id ]] || die 'Unexpected argument.'; task_id=$1; shift ;;
        esac
    done
    if [[ $command == start ]]; then
        case $harness in codex|claude|pi|opencode) ;; *) die '--harness codex|claude|pi|opencode is required.' ;; esac
        validate_harness "$harness" "$effort" "$model"
    else [[ $task_id =~ ^[0-9a-f]{32}$ ]] || die 'Invalid or missing task ID.'; fi
    if [[ $command == start || $command == follow-up ]]; then
        [[ -n $prompt_file && -f $prompt_file && -r $prompt_file ]] || die 'A readable --prompt-file is required.'
    fi
    [[ ${HERDR_ENV:-} == 1 ]] || die 'HERDR_ENV=1 is required.'
    [[ ! ${HERDR_DELEGATE_ACTIVE+x} ]] || die 'Delegates must not invoke this helper.'
    [[ -n ${HERDR_PANE_ID:-} && -n ${HERDR_TAB_ID:-} && -n ${HERDR_WORKSPACE_ID:-} && -n ${HERDR_SOCKET_PATH:-} ]] || die 'Herdr caller pane, tab, workspace and socket context are required.'
    context=$(jq -cn --arg pane "$HERDR_PANE_ID" --arg tab "$HERDR_TAB_ID" --arg workspace "$HERDR_WORKSPACE_ID" \
        --arg socket "$HERDR_SOCKET_PATH" --argjson identity "$(stat -Lc '[%d,%i]' -- "$HERDR_SOCKET_PATH")" \
        '{HERDR_PANE_ID:$pane,HERDR_TAB_ID:$tab,HERDR_WORKSPACE_ID:$workspace,HERDR_SOCKET_PATH:$socket,socket_identity:$identity}')
    base=/tmp/herdr-delegate-$UID; private_dir "$base"
    lockfile=$base/$(jq -cS 'del(.HERDR_PANE_ID)' <<< "$context" | hash).lock
    base=$base/$(jq -cS . <<< "$context" | hash); private_dir "$base"
    atomic "$base/context.json" "$context"
    if $timeout_set; then
        timeout_value=$(jq -en --arg t "$timeout_value" '$t | tonumber | select(isfinite)') || die 'Timeout must be finite seconds.'
        deadline=$(jq -n --argjson t "$timeout_value" 'now+$t')
    fi
    while :; do
        lock
        if [[ $command == start ]]; then start; unlock; return; fi
        record=$base/$task_id/record.json; load
        jq -e --argjson context "$context" '.context==$context' <<< "$task" >/dev/null || die 'Task belongs to another parent session.'
        case $command in
            cancel)
                state=$(field '.state')
                if [[ $state == queued ]]; then
                    local directory result
                    directory=$(turn_path)
                    [[ ! -e $directory/result.json ]] || die 'Refusing to overwrite an immutable turn result.'
                    update '.state="cancelled"'
                    result=$(jq -cn '{state:"cancelled",exit_code:null,response:"",complete:false,error:"Cancelled before admission.",finished_at:now}')
                    atomic "$directory/result.json" "$result"
                elif [[ $state == running ]]; then
                    require_worker active
                    update '.state="cancelling"'
                    kill -TERM -- "-$(field '.worker.pid')"
                fi ;;
            follow-up)
                state=$(view | jq -r .state)
                [[ ( $state == 'done' || $state == failed || $state == cancelled ) && -n $(field '.session_id') ]] || die 'Follow-up requires a stopped task with a saved session.'
                validate_harness "$(field '.harness')" "$(field '.effort')" "$(field '.model')"
                require_worker
                prompt=$(<"$prompt_file"); [[ $prompt == *[![:space:]]* ]] || die 'Prompt file is empty.'
                task=$(jq -c '.turn+=1' <<< "$task"); prepare_turn ;;
            cleanup) cleanup; unlock; return ;;
        esac
        if [[ $command != cleanup ]]; then data=$(view); fi
        unlock
        state=$(jq -r .state <<< "$data")
        if [[ $command != wait || ( $state != queued && $state != running && $state != cancelling ) ]]; then break; fi
        if [[ -n $deadline ]] && jq -en --argjson deadline "$deadline" 'now >= $deadline' >/dev/null; then
            data=$(jq -c '.wait_timed_out=true' <<< "$data"); break
        fi
        sleep 0.2
    done
    printf '%s\n' "$data"
}
main "$@"
