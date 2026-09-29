#!/usr/bin/env bash
set -euo pipefail

usage() { printf 'Usage: %s UPLOAD_URL TICKET_FILE MULTIPART_FIELD LOCAL_FILE REMOTE_FILENAME\n' "$0" >&2; exit 2; }
(($# == 5)) || usage
url=$1 ticket_file=$2 field=$3 file=$4 filename=$5
[[ $url == https://mcp.clickup.com/upload ]] || { echo 'Unexpected ClickUp upload URL' >&2; exit 2; }
[[ $field =~ ^[A-Za-z0-9_-]+$ ]] || usage
[[ $filename =~ ^[A-Za-z0-9._-]+$ ]] || usage
[[ -f $file && -f $ticket_file ]] || usage
[[ $(stat -c %a "$ticket_file") == 600 ]] || { echo 'Ticket file must have mode 600' >&2; exit 2; }
ticket=$(<"$ticket_file")
[[ $ticket =~ ^[A-Za-z0-9._-]+$ ]] || { echo 'Invalid upload ticket' >&2; exit 2; }

config=$(mktemp)
chmod 600 "$config"
trap 'rm -f -- "$config" "$ticket_file"' EXIT
printf 'header = "X-Upload-Ticket: %s"\n' "$ticket" >"$config"
rm -f -- "$ticket_file"
curl --config "$config" --fail --silent --show-error -X POST "$url" -F "$field=@$file;filename=$filename"
