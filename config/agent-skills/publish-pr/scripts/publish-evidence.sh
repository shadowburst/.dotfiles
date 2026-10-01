#!/usr/bin/env bash
set -uo pipefail

case "${1:-}" in
  clickup)
    shift
    set -e
    usage() { printf 'Usage: %s clickup UPLOAD_URL TICKET_FILE MULTIPART_FIELD LOCAL_FILE REMOTE_FILENAME\n' "$0" >&2; exit 2; }
    (($# == 5)) || usage
    url=$1 ticket_file=$2 field=$3 file=$4 filename=$5
    [[ -f $ticket_file && ! -L $ticket_file && -O $ticket_file ]] || usage
    config=
    trap '[[ -z "$config" ]] || rm -f -- "$config"; if [[ -f $ticket_file && ! -L $ticket_file && -O $ticket_file ]]; then rm -f -- "$ticket_file"; fi' EXIT
    [[ $url == https://mcp.clickup.com/upload ]] || { echo 'Unexpected ClickUp upload URL' >&2; exit 2; }
    [[ $field =~ ^[A-Za-z0-9_-]+$ ]] || usage
    [[ $filename =~ ^[A-Za-z0-9._-]+$ ]] || usage
    [[ -f $file && -f $ticket_file ]] || usage
    [[ $(stat -c %a "$ticket_file") == 600 ]] || { echo 'Ticket file must have mode 600' >&2; exit 2; }
    ticket=$(<"$ticket_file")
    [[ $ticket =~ ^[A-Za-z0-9._-]+$ ]] || { echo 'Invalid upload ticket' >&2; exit 2; }

    config=$(mktemp)
    chmod 600 "$config"
    printf 'header = "X-Upload-Ticket: %s"\n' "$ticket" >"$config"
    rm -f -- "$ticket_file"
    curl --config "$config" --fail --silent --show-error -X POST "$url" -F "$field=@$file;filename=$filename"
    exit
    ;;
  github) shift ;;
  *)
    printf 'Usage: %s github --pr PR --file path#description...\n       %s clickup UPLOAD_URL TICKET_FILE MULTIPART_FIELD LOCAL_FILE REMOTE_FILENAME\n' "$0" "$0" >&2
    case "${1:-}" in -h|--help) exit 0 ;; *) exit 2 ;; esac
    ;;
esac

usage() {
  cat <<'EOF'
Usage: publish-evidence.sh github --pr <number|url> --file <path#description>...
EOF
}

pr=
files=()
descriptions=()
layout_marker='<!-- upload-ui-evidence:layout:gallery-v1 -->'

markdown_text() {
  local text=$1
  text=${text//\\/\\\\}; text=${text//\*/\\*}; text=${text//_/\\_}
  text=${text//\[/\\[}; text=${text//\]/\\]}; text=${text//|/\\|}
  printf '%s' "$text"
}

render_block() {
  echo '<!-- upload-ui-evidence:start -->'
  echo "$manifest_marker"
  echo "$layout_marker"
  local i caption alt all_images=1
  for file in "${files[@]}"; do
    case "${file##*.}" in mp4|MP4|mov|MOV|webm|WEBM) all_images=0 ;; esac
  done
  if ((all_images && ${#files[@]} > 1)); then
    for ((i=0; i<${#files[@]}; i+=2)); do
      caption=$(markdown_text "${descriptions[i]}")
      alt=${descriptions[i]//\\/\\\\}; alt=${alt//]/\\]}
      if ((i + 1 < ${#files[@]})); then
        local next_caption next_alt
        next_caption=$(markdown_text "${descriptions[i+1]}")
        next_alt=${descriptions[i+1]//\\/\\\\}; next_alt=${next_alt//]/\\]}
        printf '| %s | %s |\n| --- | --- |\n' "$caption" "$next_caption"
        printf '| ![%s](%s) | ![%s](%s) |\n\n' "$alt" "${files[i]}" "$next_alt" "${files[i+1]}"
      else
        printf '**%s**\n\n![%s](%s)\n\n' "$caption" "$alt" "${files[i]}"
      fi
    done
  else
    for i in "${!files[@]}"; do
      caption=$(markdown_text "${descriptions[i]}")
      printf '**%s**\n\n' "$caption"
      case "${files[i]##*.}" in
        mp4|MP4|mov|MOV|webm|WEBM) printf '![](%s)\n\n' "${files[i]}" ;;
        *) alt=${descriptions[i]//\\/\\\\}; alt=${alt//]/\\]}; printf '![%s](%s)\n\n' "$alt" "${files[i]}" ;;
      esac
    done
  fi
  echo '<!-- upload-ui-evidence:end -->'
}

if [[ ${1:-} == --self-test && $# == 1 ]]; then
  files=(one.png two.png three.png); descriptions=('First view' 'Second | view' 'Third view')
  manifest_marker='<!-- upload-ui-evidence:manifest:test -->'
  output=$(render_block)
  [[ $output == *'| First view | Second \| view |'* && $output == *'**Third view**'* && $output == *"$layout_marker"* ]] || exit 1
  files=(demo.mp4); descriptions=('Demo')
  output=$(render_block)
  [[ $output == *'**Demo**'* && $output == *'![](demo.mp4)'* && $output != *'| --- |'* ]] || exit 1
  echo 'publish-evidence github self-test passed'
  exit 0
fi

while (($#)); do
  case "$1" in
    --pr|--file)
      (($# >= 2)) || { echo "missing value for $1" >&2; usage >&2; exit 2; }
      option=$1
      value=$2
      shift 2
      case "$option" in
        --pr) pr=$value ;;
        --file)
          path=${value%#*}
          description=${value##*#}
          if [[ "$path" == "$value" || -z "$path" || -z "$description" ]]; then
            echo "--file requires path#description" >&2
            exit 2
          fi
          files+=("$path")
          descriptions+=("$description")
          ;;
      esac
      ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[[ -n "$pr" ]] || { echo "--pr is required" >&2; exit 2; }
((${#files[@]})) || { echo "at least one --file is required" >&2; exit 2; }
((${#files[@]} <= 50)) || { echo "GitHub accepts at most 50 attachments" >&2; exit 2; }
command -v gh >/dev/null || { echo "gh is required" >&2; exit 2; }
command -v python3 >/dev/null || { echo "python3 is required" >&2; exit 2; }
command -v sha256sum >/dev/null || { echo "sha256sum is required" >&2; exit 2; }

for i in "${!files[@]}"; do
  file=${files[$i]}
  description=${descriptions[$i]}
  [[ -f "$file" ]] || { echo "file not found: $file" >&2; exit 2; }
  [[ "$description" =~ [^[:space:]] ]] || { echo "file descriptions cannot be blank" >&2; exit 2; }
  [[ "$file$description" != *$'\n'* && "$file$description" != *$'\r'* ]] || {
    echo "file paths and descriptions must be one line" >&2
    exit 2
  }
  case "${file##*.}" in
    png|PNG|jpg|JPG|jpeg|JPEG|gif|GIF|webp|WEBP|svg|SVG|mp4|MP4|mov|MOV|webm|WEBM) ;;
    *) echo "unsupported GitHub attachment: $file" >&2; exit 2 ;;
  esac
done

manifest_input=
for i in "${!files[@]}"; do
  manifest_input+="$(sha256sum "${files[$i]}" | cut -d' ' -f1)"$'\t'"${descriptions[$i]}"$'\n'
done
manifest=$(printf '%s' "$manifest_input" | sha256sum | cut -d' ' -f1)
manifest_marker="<!-- upload-ui-evidence:manifest:$manifest -->"

body=$(gh pr view "$pr" --json body --jq .body) || {
  echo "github: could not read PR $pr" >&2
  exit 1
}
block=$(mktemp)
new_body=$(mktemp)
trap 'rm -f "$block" "$new_body"' EXIT
render_block >"$block"

GH_BODY=$body MANIFEST_MARKER=$manifest_marker ASSET_COUNT=${#files[@]} python3 - "$block" "$new_body" <<'PY'
import os
import re
import sys
from pathlib import Path

start_marker = "<!-- upload-ui-evidence:start -->"
end_marker = "<!-- upload-ui-evidence:end -->"
validation_start = "<!-- local-ci-report:start -->"
validation_end = "<!-- local-ci-report:end -->"
body = os.environ["GH_BODY"]
block = Path(sys.argv[1]).read_text().rstrip()
validation_starts = [match.start() for match in re.finditer(re.escape(validation_start), body)]
validation_ends = [match.start() for match in re.finditer(re.escape(validation_end), body)]
if (len(validation_starts), len(validation_ends)) not in {(0, 0), (1, 1)} or (validation_starts and validation_starts[0] >= validation_ends[0]):
    raise SystemExit("managed Validation markers are malformed")
headings = list(re.finditer(r"(?m)^## UI Evidence[ \t]*$", body))
if len(headings) != 1:
    raise SystemExit("PR body must contain exactly one ## UI Evidence section")

heading = headings[0]
section_end_match = re.search(r"(?m)^## .+$", body[heading.end():])
section_end = heading.end() + section_end_match.start() if section_end_match else len(body)
section = body[heading.end():section_end]
start_count = section.count(start_marker)
end_count = section.count(end_marker)
if body.count(start_marker) != start_count or body.count(end_marker) != end_count:
    raise SystemExit("managed evidence markers must be inside ## UI Evidence")
if (start_count, end_count) not in {(0, 0), (1, 1)}:
    raise SystemExit("managed evidence markers are malformed")
if start_count:
    marker_start = section.index(start_marker)
    marker_end = section.index(end_marker)
    if marker_start >= marker_end:
        raise SystemExit("managed evidence markers are malformed")
    existing_block = section[marker_start:marker_end]
    marker = os.environ["MANIFEST_MARKER"]
    layout = "<!-- upload-ui-evidence:layout:gallery-v1 -->"
    links = re.findall(r"]\(([^)]+)\)", existing_block)
    if (
        body.count(marker) == existing_block.count(marker) == 1
        and body.count(layout) == existing_block.count(layout) == 1
        and len(links) == int(os.environ["ASSET_COUNT"])
        and all(link.startswith("https://github.com/user-attachments/assets/") for link in links)
    ):
        raise SystemExit(3)
    marker_end += len(end_marker)
    section = section[:marker_start] + section[marker_end:]

section = section.strip()
replacement = f"\n\n{section}\n\n{block}\n\n" if section else f"\n\n{block}\n\n"
Path(sys.argv[2]).write_text(body[:heading.end()] + replacement + body[section_end:].lstrip("\n"))
PY
case $? in
  0) ;;
  3) echo "github: evidence unchanged; reused existing uploads" >&2; exit 0 ;;
  *) exit 2 ;;
esac

status=0
gh_args=(pr edit "$pr" --body-file "$new_body")
for i in "${!files[@]}"; do
  file=${files[$i]}
  case "${file##*.}" in
    mp4|MP4|mov|MOV|webm|WEBM) gh_args+=(--attach "$file") ;;
    *) gh_args+=(--attach "$file#${descriptions[$i]}") ;;
  esac
done
if gh "${gh_args[@]}"; then
  echo "github: uploaded ${#files[@]} file(s)" >&2
else
  echo "github: upload failed" >&2
  status=1
fi

exit "$status"
