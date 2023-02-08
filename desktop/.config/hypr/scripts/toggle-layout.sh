#!/usr/bin/env bash

LAYOUT="$(hyprctl getoption general:layout -j | jq --raw-output .str)"
if [[ "$LAYOUT" = "master" ]]; then
    hyprctl keyword general:layout dwindle
elif [[ "$LAYOUT" = "dwindle" ]]; then
    hyprctl keyword general:layout master
fi
