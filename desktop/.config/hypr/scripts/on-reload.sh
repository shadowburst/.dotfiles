#!/usr/bin/env bash

# Start wallpaper daemon
pkill hyprpaper
hyprpaper &

eww close-all
hyprctl monitors -j | jq --raw-output .[].id | while read -r id; do
	eww open "bar-$id"
done
