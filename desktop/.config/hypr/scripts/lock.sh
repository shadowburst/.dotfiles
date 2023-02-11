#!/usr/bin/env bash

background=1C1F24FF
foreground=BBC2CFFF
primary=935FB0FF
warning=DA8548FF
danger=CB5B67FF
font="Noto Sans"

swaylock --daemonize \
    --grace 10 --grace-no-mouse \
    --ignore-empty-password \
    --indicator-idle-visible \
    --indicator-radius=120 --indicator-thickness=8 \
    --inside-color=$background --inside-ver-color=$background --inside-wrong-color=$background \
    --ring-color=$background --ring-ver-color=$primary --ring-wrong-color=$danger \
    --key-hl-color=$primary --bs-hl-color=$danger \
    --separator-color=$background --line-uses-ring \
    --text-color=$primary --text-ver-color=$primary --text-wrong-color=$danger --text-caps-lock-color=$warning \
    --font=$font --font-size=40\
    --clock --timestr="%R" --datestr="%a, %d %B" \
    --fade-in 0.2 --effect-vignette=0.5:0.5 --effect-blur=7x3 --screenshots
