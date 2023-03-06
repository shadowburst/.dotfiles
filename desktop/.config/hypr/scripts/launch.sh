#!/usr/bin/env bash

export XDG_CURRENT_DESKTOP=Hyprland
export XDG_SESSION_TYPE=wayland
export XDG_SESSION_DESKTOP=Hyprland

export QT_AUTO_SCREEN_SCALE_FACTOR=1
export QT_QPA_PLATFORM="wayland;xcb"
export QT_WAYLAND_DISABLE_WINDOWDECORATION=1
export QT_QPA_PLATFORMTHEME=kvantum

export GTK_THEME=Orchis-Purple-Dark
export XCURSOR_THEME=Bibata-Modern-Classic
export XCURSOR_SIZE=16

# Qt applications style
export QT_STYLE_OVERRIDE=kvantum
export QT_QPA_PLATFORMTHEME=qt5ct

# Common environment variables
export TERMINAL="alacritty"
export BROWSER="brave"
export EDITOR="emacsclient -t"
export MANPAGER="nvim +Man!"

# Start keyring
eval "$(gnome-keyring-daemon --start --components=pkcs11,secrets,ssh,gpg)"
export SSH_AUTH_SOCK

exec Hyprland
