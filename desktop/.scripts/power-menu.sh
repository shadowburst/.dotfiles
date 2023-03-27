#!/usr/bin/env bash

DMENU="tofi -c $HOME/.config/tofi/powermenu.config"

# Options
lock=''
suspend=''
logout=''
reboot=''
poweroff=''

# Actions
chosen=$(echo -e "$lock\n$suspend\n$logout\n$reboot\n$poweroff" | $DMENU)
case ${chosen} in
	$lock)
		(sleep 0.3 && ~/.scripts/lock.sh) &
		;;
	$suspend)
		systemctl suspend
		;;
	$logout)
		loginctl terminate-user $USER
		;;
	$reboot)
		systemctl reboot
		;;
	$poweroff)
		systemctl poweroff
		;;
esac
