#!/usr/bin/env bash

hyprctl setcursor Bibata-Modern-Classic 18

# Load the polkit agent
/usr/lib/polkit-gnome/polkit-gnome-authentication-agent-1 &

# Launch torrents daemon
transmission-daemon &

# Launch Emacs daemon
emacs --daemon &

blueman-applet &
nm-applet &

dunst &
light -N 5 &
