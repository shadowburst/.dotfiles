#!/usr/bin/env bash

# Start wallpaper daemon
pkill hyprpaper
hyprpaper &

pkill ags
ags &
