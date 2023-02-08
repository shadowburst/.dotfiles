#!/usr/bin/env bash

if pgrep -x rofi; then
    pkill rofi
	exit 0
fi

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
		background=00000077
		foreground=BBC2CFFF
		primary=935FB0FF
		ring=B382CBFF
		inside=1C1F24FF
		wrong=CB5B67FF
		font="Noto Sans"

		# nohup $TERMINAL --class cava -e cava &
		# cava_window="$!"
		# sleep 0.2

		swaylock -n --ignore-empty-password \
			--clock --indicator --screen=1 \
			--color=$background \
			--inside-color=$inside --ring-color=$primary \
			--insidever-color=$inside --ringver-color=$ring \
			--insidewrong-color=$inside --ringwrong-color=$wrong \
			--keyhl-color=$ring --bshl-color=$wrong \
			--separator-color=$ring --line-uses-inside \
			--wrong-color=$wrong --modif-color=$wrong --time-color=$primary --date-color=$primary --greeter-color=$foreground \
			--verif-text="" --wrong-text="" --greeter-text="" --noinput-text="" --no-modkey-text \
			--time-str="%R" --date-str="%a, %d %B" \
			--wrong-font=$font --time-font="$font:style=Bold" --date-font=$font --greeter-font="JetBrainsMono Nerd Font" \
			--wrong-size=20 --time-size=140 --date-size=30 --greeter-size=100 \
			--ind-pos="x+w/2:y+h/2" --time-pos="ix:iy-220" --date-pos="tx:ty+50" --greeter-pos="ix:iy+r/2-5" \
			--radius=70 \
			--custom-key-commands \
			--cmd-media-play="playerctl play-pause" --cmd-media-pause="playerctl play-pause" --cmd-media-prev="playerctl previous" --cmd-media-next="playerctl next" \
			--cmd-audio-mute="amixer -D pulse set Master 1+ toggle" --cmd-volume-down="amixer -D pulse sset Master 5%-" --cmd-volume-up="amixer -D pulse sset Master 5%+"

		# kill "$cava_window"
		;;
	$suspend)
		systemctl suspend
		;;
	$logout)
		loginctl terminate-user $USER
		;;
esac
