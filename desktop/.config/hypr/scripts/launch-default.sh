#!/usr/bin/env bash

case $(hyprctl monitors -j | jq '.[] | select(.focused == true) | .activeWorkspace.id') in
1)
	$BROWSER &
	;;
2)
	$TERMINAL -e "tmux-sessionizer" &
	;;
3)
	discord &
	;;
4)
	$TERMINAL -e lf &
	;;
5)
	lutris &
	;;
6)
	gimp &
	;;
7)
	$TERMINAL &
	;;
esac
