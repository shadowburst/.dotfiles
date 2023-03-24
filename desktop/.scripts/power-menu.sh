#!/usr/bin/env bash

DMENU="tofi"

# Options
lock="Lock"
suspend="Suspend"
logout="Logout"
reboot="Reboot"
poweroff="Power off"

# Actions
chosen=$(echo -e "$lock\n$suspend\n$logout\n$reboot\n$poweroff" | $DMENU)
case ${chosen} in
	$lock)
		(sleep 0.2 && ~/.scripts/lock.sh) &
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
