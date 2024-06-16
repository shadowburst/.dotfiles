#!/usr/bin/env bash

updates="$( (
	checkupdates
  paru -Qua
) | column -t | cut -c 1-70 | sort)"

if [[ -n "$updates" ]]; then
	eww update updates-count="$(echo "$updates" | wc -l)"
else
	eww update updates-count=0
fi

echo "$updates"
