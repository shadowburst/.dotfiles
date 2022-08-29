#!/usr/bin/env bash

if pgrep -x rofi; then
    pkill rofi
else
    rofi -no-lazy-grab -show-icons -show drun
fi
