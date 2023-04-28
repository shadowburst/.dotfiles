#!/usr/bin/env bash

socat -u UNIX-CONNECT:/tmp/hypr/$HYPRLAND_INSTANCE_SIGNATURE/.socket2.sock - | while read -r line; do
	if [[ $line = 'monitoradded'* ]] || [[ $line = 'monitorremoved'* ]]; then
		~/.config/hypr/scripts/on-reload.sh
	fi
done
