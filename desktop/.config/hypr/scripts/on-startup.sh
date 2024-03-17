#!/usr/bin/env bash

# Handle monitors
~/.config/hypr/scripts/watch-monitors.sh &
kanshi &

# Idle daemon
hypridle &

# Launch EWW daemon
eww daemon &

# Theme settings
hyprctl setcursor Bibata-Modern-Classic 24 &

# Set brightness settings
brightnessctl -s set 40%

# Load the polkit agent
/usr/lib/polkit-gnome/polkit-gnome-authentication-agent-1 &

# Launch torrents daemon
transmission-daemon &

# Launch applets
blueman-applet &
nm-applet &
