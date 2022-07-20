#!/usr/bin/env bash

case $(xdotool get_desktop) in
    0)
        brave
        ;;
    1)
        emacsclient -c -a "emacs"
        ;;
    2)
        discord
        ;;
    3)
        emacsclient -c -a "emacs" --eval "(ranger)"
        ;;
    4)
        lutris
        ;;
    5)
        gimp
        ;;
    6)
        alacritty
        ;;
esac
