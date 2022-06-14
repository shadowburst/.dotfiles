#!/usr/bin/env zsh

# Set wallpaper
feh --no-fehbg --bg-fill "$HOME/.wallpapers/current.jpg" &

# Start emacs daemon
emacs --daemon
