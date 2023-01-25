#!/usr/bin/env bash

if pgrep -x rofi; then
    pkill rofi
	exit 0
fi

rofi -no-lazy-grab  -show drun
