#!/usr/bin/env bash

# Clear the screen before rendering
lf -remote "send reload"
kitty +icat --clear --silent --transfer-mode file

FILE_PATH="$1"
w="$2"
h="$3"
x="$4"
y="$5"

IMAGE_CACHE_PATH="/tmp/$(basename "$FILE_PATH")"

mimetype="$(file -Lb --mime-type "$FILE_PATH")"

case "$mimetype" in
image/*)
	kitty +icat --silent --transfer-mode file --place "${w}x${h}@${x}x${y}" "$FILE_PATH"
	;;
video/*)
	ffmpegthumbnailer -i "$FILE_PATH" -o "${IMAGE_CACHE_PATH}" -s 0
	kitty +icat --silent --transfer-mode file --place "${w}x${h}@${x}x${y}" "$IMAGE_CACHE_PATH"
	;;
application/pdf)
	pdftoppm -f 1 -l 1 \
		-scale-to-y -1 \
		-singlefile \
		-jpeg -tiffcompression jpeg \
		-- "${FILE_PATH}" "${IMAGE_CACHE_PATH%.*}"
	kitty +icat --silent --transfer-mode file --place "${w}x${h}@${x}x${y}" "$IMAGE_CACHE_PATH"
	;;
*)
	pistol "$FILE_PATH"
	;;
esac
