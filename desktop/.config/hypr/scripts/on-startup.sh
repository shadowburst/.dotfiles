#!/usr/bin/env bash

# Watch monitor hot pluggin in order to reload the config
~/.config/hypr/scripts/watch-monitors.sh &

# Lock and turn off displays if idle
swayidle \
	timeout 10 "pgrep swaylock && hyprctl dispatch dpms off" \
	timeout 300 "$HOME/.scripts/lock.sh" \
	timeout 310 "hyprctl dispatch dpms off" &

# Load the polkit agent
/usr/lib/polkit-gnome/polkit-gnome-authentication-agent-1 &

# Set cursor theme
hyprctl setcursor Bibata-Modern-Classic 18 &

# Set minimum screen brightness
light -N 5 &

# Notification daemon
dunst &

# Launch torrents daemon
transmission-daemon &

# Launch Emacs daemon
emacs --daemon &

# Launch applets
blueman-applet &
nm-applet &

# Launch EWW daemon
eww daemon &
