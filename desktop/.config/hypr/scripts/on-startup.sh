#!/usr/bin/env bash

# Watch monitor hot plugging in order to reload the config
~/.config/hypr/scripts/watch-monitors.sh &

# Load the polkit agent
/usr/lib/polkit-gnome/polkit-gnome-authentication-agent-1 &

# Set brightness settings
brightnessctl -s set 40%

# Launch torrents daemon
transmission-daemon &

# Launch applets
blueman-applet &
nm-applet &

kanshi &

# Launch EWW daemon
eww daemon &

# Theme settings
hyprctl setcursor Bibata-Modern-Classic 24 &
