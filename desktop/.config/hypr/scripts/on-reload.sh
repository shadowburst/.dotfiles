#!/usr/bin/env bash

swaybg -i ~/.wallpapers/current.jpg -m fill &

pkill eww
eww daemon

hyprctl monitors -j | jq --raw-output .[].id | while read -r id
do
  eww open "bar$id"
done
