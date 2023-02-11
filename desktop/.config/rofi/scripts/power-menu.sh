#!/usr/bin/env bash

if pgrep -x rofi; then
    pkill rofi
	exit 0
fi

rofi_dir="$HOME/.config/rofi"

# Options
shutdown=''
reboot=''
lock=''
suspend=''
logout=''
yes=''
no=''

# Rofi CMD
rofi_cmd() {
	rofi -dmenu \
		-theme ${rofi_dir}/themes/powermenu.rasi
}

# Pass variables to rofi dmenu
run_rofi() {
	echo -e "$lock\n$suspend\n$logout\n$reboot\n$shutdown" | rofi_cmd
}

# Actions
chosen="$(run_rofi)"
case ${chosen} in
	$shutdown)
		systemctl poweroff
		;;
	$reboot)
		systemctl reboot
		;;
	$lock)
		(sleep 0.3 && ~/.config/hypr/scripts/lock.sh) &
		;;
	$suspend)
		systemctl suspend
		;;
	$logout)
		loginctl terminate-user $USER
		;;
esac
