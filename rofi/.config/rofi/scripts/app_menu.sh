#!/usr/bin/env bash

if pgrep -x rofi ; then
    pkill rofi
else
    rofi -no-lazy-grab -no-disable-history -show drun -theme themes/app_menu.rasi
fi


