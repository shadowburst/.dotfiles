#!/usr/bin/env bash

dir="$HOME/.config/rofi/themes"
rofi_command="rofi -theme $dir/power_menu.rasi"

#### Options ###
power_off=""
reboot=""
lock=""
suspend=""
log_out=""

options="$power_off\n$reboot\n$lock\n$suspend\n$log_out"

chosen=$(echo -e "$options" | $rofi_command -dmenu -selected-row 2)
case $chosen in
    $lock)
      # loginctl lock-session
      light-locker-command -l
      ;;
    $power_off)
      systemctl poweroff
      ;;
    $reboot)
      systemctl reboot
      ;;
    $suspend)
	    systemctl suspend
      ;;
    $log_out)
      loginctl terminate-user $USER
      ;;
esac

