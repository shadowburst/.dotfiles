if [ "$(tty)" = "/dev/tty1" ]; then
    pgrep Hyprland || ~/.config/hypr/scripts/launch.sh
fi
