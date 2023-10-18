#!/usr/bin/env bash

# Watch monitor hot plugging in order to reload the config
~/.config/hypr/scripts/watch-monitors.sh &

# Lock and turn off displays if idle
swayidle timeout 10 "pgrep gtklock && hyprctl dispatch dpms off" &

# Set minimum screen brightness
light -N 5 &

# Launch torrents daemon
transmission-daemon &

# Launch applets
blueman-applet &
nm-applet &

kanshi &

# Launch EWW daemon
eww daemon &

# Theme settings
hyprctl setcursor Bibata-Modern-Classic 18 &

# GTK
dconf write /org/gnome/desktop/interface/icon-theme "'Tela-dark'"
dconf write /org/gnome/desktop/interface/color-scheme "'prefer-dark'"
dconf write /org/gnome/desktop/interface/cursor-theme "'Bibata-Modern-Classic'"
dconf write /org/gnome/desktop/interface/gtk-theme "'Catppuccin-Macchiato-Standard-Blue-Dark'"
