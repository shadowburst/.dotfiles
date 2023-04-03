#!/usr/bin/env bash

LAYOUT="$(hyprctl getoption master:orientation -j | jq --raw-output .str)"
if [[ "$LAYOUT" = "center" ]]; then
	hyprctl keyword master:orientation "left"
	hyprctl dispatch layoutmsg orientationleft
else
	hyprctl keyword master:orientation "center"
	hyprctl dispatch layoutmsg orientationcenter
fi
