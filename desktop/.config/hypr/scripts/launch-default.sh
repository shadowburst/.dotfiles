#!/usr/bin/env bash

case $(hyprctl monitors -j | jq '.[] | select(.focused == true) | .activeWorkspace.id') in
1)
  cmd="$BROWSER"
  ;;
2)
  cmd="$TERMINAL -e 'tmux-sessionizer'"
  ;;
3)
  cmd="discord"
  ;;
4)
  cmd="$TERMINAL -e yazi"
  ;;
5)
  cmd="lutris"
  ;;
6)
  cmd="gimp"
  ;;
7)
  cmd="$TERMINAL"
  ;;
esac

if [ -n "$cmd" ]; then
  $SHELL -c "$cmd"
fi
