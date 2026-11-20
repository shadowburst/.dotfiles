#!/usr/bin/env bash
# Upload one local file to a ClickUp task with a ticket from clickup_request_attachment_upload.
# The ticket is read from a mode-600 file so it never appears in a command line.
set -euo pipefail

usage() { printf 'Usage: %s UPLOAD_URL TICKET_FILE MULTIPART_FIELD LOCAL_FILE REMOTE_FILENAME\n' "$0" >&2; exit 2; }
(($# == 5)) || usage
url=$1 ticket_file=$2 field=$3 file=$4 filename=$5
[[ -f $ticket_file && ! -L $ticket_file && -O $ticket_file ]] || usage
config=
trap '[[ -z $config ]] || rm -f -- "$config"; rm -f -- "$ticket_file"' EXIT
[[ $url == https://mcp.clickup.com/upload ]] || { echo 'Unexpected ClickUp upload URL' >&2; exit 2; }
[[ $field =~ ^[A-Za-z0-9_-]+$ && $filename =~ ^[A-Za-z0-9._-]+$ && -f $file ]] || usage
mode=$(stat -c %a -- "$ticket_file" 2>/dev/null || stat -f %Lp -- "$ticket_file")
[[ $mode == 600 ]] || { echo 'Ticket file must have mode 600' >&2; exit 2; }
ticket=$(<"$ticket_file")
[[ $ticket =~ ^[A-Za-z0-9._-]+$ ]] || { echo 'Invalid upload ticket' >&2; exit 2; }

config=$(mktemp)
chmod 600 "$config"
printf 'header = "X-Upload-Ticket: %s"\n' "$ticket" >"$config"
curl --config "$config" --fail --silent --show-error -X POST "$url" -F "$field=@$file;filename=$filename"
