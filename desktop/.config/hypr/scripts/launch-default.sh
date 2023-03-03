#!/usr/bin/env bash

case $(hyprctl monitors -j | jq '.[] | select(.focused == true) | .activeWorkspace.id') in
    1)
        brave &
        ;;
    2)
        emacsclient -c -a "emacs" &
        ;;
    3)
        discord &
        ;;
    4)
        emacsclient -c -a "emacs" --eval "(ranger)" &
        ;;
    5)
        lutris &
        ;;
    6)
        gimp &
        ;;
    7)
        alacritty &
        ;;
esac
