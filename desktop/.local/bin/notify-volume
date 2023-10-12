#!/usr/bin/env bash

notification="volume-notification"

icon="audio-volume-muted-symbolic"
text="muted"

state=$(wpctl get-volume @DEFAULT_AUDIO_SINK@)

muted=$(echo "$state" | grep MUTED)
volume=$(echo "$state" | awk '{ print $2, "* 100 / 1" }' | bc)

if [[ -z $muted ]]; then
	text="$volume%"

	if [[ "$volume" -ge 50 ]]; then
		icon="audio-volume-high-symbolic"
	elif [[ "$volume" -gt 0 ]]; then
		icon="audio-volume-medium-symbolic"
	else
		icon="audio-volume-low-symbolic"
	fi
fi

dunstify -a "changeVolume" -u low -i "$icon" -h string:x-dunst-stack-tag:$notification -h int:value:"$volume" "Volume [$text]" >/dev/null
