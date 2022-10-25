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
			background=00000055
			foreground=BBC2CFFF
			primary=51AFEFFF
			ring=2257A0FF
			inside=282C34FF
			wrong=FF6C6BFF
			font="Roboto"

			i3lock -n --ignore-empty-password \
				--clock --indicator --screen=1 \
				--color=$background \
				--inside-color=$inside --ring-color=$ring \
				--insidever-color=$inside --ringver-color=$primary \
				--insidewrong-color=$inside --ringwrong-color=$wrong \
				--keyhl-color=$primary --bshl-color=$wrong \
				--separator-color=$ring --line-uses-inside \
				--wrong-color=$wrong --modif-color=$wrong --time-color=$primary --date-color=$primary --greeter-color=$foreground \
				--verif-text="" --wrong-text="" --greeter-text="" --noinput-text="" \
				--time-str="%R" --date-str="%a, %d %B" \
				--wrong-font=$font --time-font="$font:style=Bold" --date-font=$font --greeter-font="JetBrainsMono Nerd Font" \
				--wrong-size=20 --time-size=140 --date-size=40 --greeter-size=100 \
				--ind-pos="x+w/2:y+h/2" --time-pos="ix:iy-220" --date-pos="tx:ty+50" --greeter-pos="ix:iy+r/2-5" \
				--radius=70 \
				--pass-media-keys --pass-screen-keys --no-modkey-text &

			sleep 10

			if [[ $(pgrep -x i3lock) ]]; then
				xset dpms force off
			fi

		fi
		;;
	$suspend)
		systemctl suspend
		;;
	$logout)
		loginctl terminate-user $USER
		;;
esac
