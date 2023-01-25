#!/usr/bin/env bash

notification="volume-notification"

icon="audio-volume-muted-symbolic"
text="muted"

state=$(amixer -D pulse sget Master)


muted=$(echo "$state" | awk -F '[][]' '/Left:/{ print $4 }')
volume=$(echo "$state" | awk -F '[][]' '/Left:/{ print $2 }' | tr -d %)

if [[ "$muted" = "on" ]]; then
    text="$volume%"

    if [[ "$volume" -ge 50 ]]; then
        icon="audio-volume-high-symbolic"
    elif [[ "$volume" -gt 0 ]]; then
        icon="audio-volume-medium-symbolic"
    else
        icon="audio-volume-low-symbolic"
    fi
fi

dunstify -a "changeVolume" -u low -i "$icon" -h string:x-dunst-stack-tag:$notification -h int:value:"$volume" "Volume [$text]" > /dev/null
