#!/usr/bin/env bash

socat -u "UNIX-CONNECT:/tmp/hypr/$HYPRLAND_INSTANCE_SIGNATURE/.socket2.sock" - | while read -r line; do
	if [[ $line = 'monitoradded'* ]] || [[ $line = 'monitorremoved'* ]]; then
		hyprctl reload
	fi
done
