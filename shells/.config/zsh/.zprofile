if [ "$(tty)" = "/dev/tty1" ]; then
    pgrep Hyprland || ~/.config/hypr/launch.sh
fi
