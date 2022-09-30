if [ "$(tty)" = "/dev/tty1" ]; then
    pgrep leftwm || exec startx
fi
