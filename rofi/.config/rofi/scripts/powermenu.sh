#!/usr/bin/env bash

## Author : Aditya Shakya (adi1090x)
## Github : @adi1090x

rofi_dir="$HOME/.config/rofi"

# CMDs
uptime="$(uptime -p | sed -e 's/up //g')"
host=$(hostname)

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
		-p "Goodbye ${USER}" \
		-mesg "Uptime: $uptime" \
		-theme ${dir}/themes/powermenu.rasi
}

# Confirmation CMD
confirm_cmd() {
	rofi -dmenu \
		-p 'Confirmation' \
		-mesg 'Are you Sure?' \
		-theme ${dir}/themes/shared/confirm.rasi
}

# Ask for confirmation
confirm_exit() {
	echo -e "$yes\n$no" | confirm_cmd
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
		if [[ -x '/usr/bin/i3lock' ]]; then
			i3lock -n --ignore-empty-password \
				--clock --indicator --screen=1 \
				--color=00000022 \
				--inside-color=282C34FF --ring-color=2257A0FF \
				--insidever-color=282C34FF --ringver-color=51AFEFFF \
				--insidewrong-color=282C34FF --ringwrong-color=FF6C6BFF \
				--keyhl-color=51AFEFFF --bshl-color=FF6C6BFF \
				--separator-color=2257A0FF --line-uses-inside \
				--modif-color=FF6C6BFF --time-color=51AFEFFF --date-color=51AFEFFF --greeter-color=BBC2CFFF \
				--verif-text="" --wrong-text="" --greeter-text="Enter password to unlock" \
				--time-str="%R" --date-str="%a, %d %B" \
				--time-font="Roboto:style=Bold" --date-font="Roboto" --greeter-font="Roboto" \
				--time-size=140 --date-size=40 --greeter-size=16 \
				--ind-pos="x+w/2:y+h/2" --time-pos="ix:iy-220" --date-pos="tx:ty+50" --greeter-pos="ix:iy+170" \
				--radius=60 \
				--pass-media-keys --pass-screen-keys
		fi
		;;
	$suspend)
		systemctl suspend
		;;
	$logout)
		loginctl terminate-user $USER
		;;
esac
