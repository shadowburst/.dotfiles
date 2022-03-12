#!/usr/bin/env bash

if [ "$1" != "$f" ]; then
	case "$(file -Lb --mime-type -- "$f")" in
	image/*) exit ;;
	esac
fi

kitty +icat --clear --silent --transfer-mode file
