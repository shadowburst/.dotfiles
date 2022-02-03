#!/usr/bin/env bash

if pgrep -x rofi ; then
    pkill rofi
else
    rofi -no-lazy-grab -normal-window -show drun -theme themes/app_menu.rasi
fi