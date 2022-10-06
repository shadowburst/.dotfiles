#!/bin/bash

# Needed to ensure ssh agent functions correctly
source /etc/X11/xinit/xinitrc.d/50-systemd-user.sh

sysresources=/etc/X11/xinit/.Xresources
userresources="$HOME/.Xresources"

sysmodmap=/etc/X11/xinit/.Xmodmap
usermodmap="$HOME/.Xmodmap"

sysprofile=/etc/xprofile
userprofile="$HOME/.xprofile"

[ -f "$sysresources" ] && xrdb -merge "$sysresources"
[ -f "$userresources" ] && xrdb -merge "$userresources"

[ -f "$sysmodmap" ] && xmodmap "$sysmodmap"
[ -f "$usermodmap" ] && xmodmap "$usermodmap"

[ -f "$sysprofile" ] && . "$sysprofile"
[ -f "$userprofile" ] && . "$userprofile"

exec leftwm
