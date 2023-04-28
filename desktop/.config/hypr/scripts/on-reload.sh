#!/usr/bin/env bash

pkill swaybg
swaybg -i ~/.wallpapers/current.jpg -m fill &

eww close-all
hyprctl monitors -j | jq --raw-output .[].id | while read -r id; do
	eww open "bar-$id"
done
