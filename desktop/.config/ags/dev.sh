#!/usr/bin/env bash

WORKDIR="$HOME/.config/ags"

function _ags() {
	pkill ags
	ags &
}

_ags
inotifywait --quiet --monitor --event create,modify,delete --recursive "$WORKDIR" | while read DIRECTORY EVENT FILE; do
	file_extension=${FILE##*.}
	case $file_extension in
	js)
		echo "reload JS..."
		_ags
		;;
	scss)
		echo "reload SCSS..."
		ags -f "$WORKDIR/loadCss.js" #&>/dev/null
		;;
	esac
done
