#!/usr/bin/env bash

WORKSPACE_NAMES=("" "" "" "" "" "" "")
NAMES_JSON=$(printf '%s\n' "${WORKSPACE_NAMES[@]}" | jq -c -R '.' | jq --slurp -c '.')

workspaces (){
    MONITOR_WORKSPACES=$(hyprctl monitors -j | jq -Mc 'map(.activeWorkspace.id)')
	WORKSPACE_WINDOWS=$(hyprctl workspaces -j | jq 'map({key: .id | tostring, value: .windows}) | from_entries')
	seq 1 "${#WORKSPACE_NAMES[@]}" | jq --argjson monitors "${MONITOR_WORKSPACES}" --argjson names "${NAMES_JSON}" --argjson windows "${WORKSPACE_WINDOWS}" --slurp -Mc 'map(tostring) | map(. as $id | {id: $id, name: $names[$id | tonumber - 1], windows: ($windows[$id]//0), monitor: ($monitors | index($id | tonumber))})'
}

workspaces
socat -u UNIX-CONNECT:/tmp/hypr/$HYPRLAND_INSTANCE_SIGNATURE/.socket2.sock - | while read -r line; do
	workspaces
done
