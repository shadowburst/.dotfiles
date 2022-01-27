#!/usr/bin/env bash

picom -b --experimental-backends --dbus &
xrdb "$HOME/.Xresources" &