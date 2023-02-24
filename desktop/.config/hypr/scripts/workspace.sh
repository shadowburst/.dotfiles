#!/usr/bin/env bash

WORKSPACE="$1"

MONITOR="$(hyprctl monitors -j | jq -Mc --arg workspace $WORKSPACE '.[] | select(.activeWorkspace.id == ($workspace | tonumber) and .focused == false).id')"

if [[ -n "$MONITOR" ]]; then
    hyprctl dispatch swapactiveworkspaces $MONITOR current
else
    hyprctl dispatch workspace $WORKSPACE
fi
