#!/usr/bin/env bash

WORKSPACE="$1"

OTHER_MONITOR="$(hyprctl monitors -j | jq -Mc --arg workspace "$WORKSPACE" '.[] | select(.activeWorkspace.id == ($workspace | tonumber) and .focused == false).id')"
CURRENT_MONITOR="$(hyprctl monitors -j | jq -Mc '.[] | select(.focused == true).id')"

if [[ -n "$OTHER_MONITOR" ]]; then
	hyprctl dispatch swapactiveworkspaces "$OTHER_MONITOR" "$CURRENT_MONITOR"
else
	hyprctl dispatch workspace "$WORKSPACE"
	hyprctl dispatch moveworkspacetomonitor "$WORKSPACE" "$CURRENT_MONITOR"
fi
