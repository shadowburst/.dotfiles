#!/usr/bin/env bash
# Record a cutaway plan against Pest's in-process Laravel app and export it as WebM.
set -euo pipefail

usage() { echo 'Usage: record.sh PLAN.json SETUP.php OUTPUT.webm | record.sh --self-test' >&2; exit 2; }

# Print every rule the plan breaks; cutaway's own validator checks actions and field types later.
check_plan() {
  local problems
  problems=$(jq -r '
    ["path", "steps", "timeout", "hide", "colorScheme"] as $plan_keys |
    ["action", "selector", "text", "key", "y", "file", "expect", "pause", "duration", "hold"] as $step_keys |
    if type != "object" then "plan must be a JSON object" else
      (if has("url") then "use path (e.g. \"/dashboard\"), not url: the app address only exists inside the test" else empty end),
      ((keys - $plan_keys - ["url"])[] | "unknown plan key: \(.)"),
      (if (.path | type) == "string" and (.path | startswith("/")) then empty else "path must be a string starting with /" end),
      (if (.steps | type) == "array" and (.steps | length) > 0 then
        .steps | to_entries[] | "step \(.key + 1): " as $at | .value |
        if type != "object" then $at + "must be an object" else
          ((keys - $step_keys)[] | $at + "unknown key \(.)"),
          (if (.action | IN("click", "tap", "press", "upload")) and (has("expect") | not)
           then $at + "\(.action) needs expect: a selector visible once the step took effect" else empty end)
        end
      else "steps must be a non-empty array" end)
    end' "$1") || return 1
  [[ -z $problems ]] || { printf 'plan: %s\n' "$problems" >&2; return 1; }
}

# Print the plan as one JSON line, with upload files made absolute so it can be copied anywhere.
resolved_plan() {
  local dir
  dir=$(cd "$(dirname "$1")" && pwd)
  jq -c --arg dir "$dir" '.steps |= map(
    if has("file") then .file = ([.file] | flatten | map(if startswith("/") then . else "\($dir)/\(.)" end)) else . end
  )' "$1"
}

php_string() { local s=${1//\\/\\\\}; printf "'%s'" "${s//\'/\\\'}"; }

# Print the body of a `pest --agent` test that runs the setup, then records the plan against the in-process server.
render_snippet() {
  local plan=$1 setup=$2 work=$3 cli=$4 json arg args=() command
  json=$(resolved_plan "$plan")
  for arg in node "$cli" record "$work/plan.json" --out "$work/recording" \
    --width 1280 --height 720 --fps 30 --quality standard; do
    args+=("$(php_string "$arg")")
  done
  printf -v command '%s, ' "${args[@]}"
  sed '1{/^<?php/d}' "$setup"
  cat <<PHP
\$page = visit($(php_string "$(jq -r .path <<<"$json")"));
\$plan = json_decode(<<<'PLAN'
$json
PLAN, true, 512, JSON_THROW_ON_ERROR);
\$plan['url'] = preg_replace('#^(https?://[^/]+).*\$#', '\$1', \$page->url()).\$plan['path'];
unset(\$plan['path']);
file_put_contents($(php_string "$work/plan.json"), json_encode(\$plan, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
\$process = new \\Symfony\\Component\\Process\\Process([${command%, }]);
\$process->setTimeout(600);
\$process->start();
while (\$process->isRunning()) {
    \$process->checkTimeout();
    \$page->wait(0.2);
}
file_put_contents($(php_string "$work/cutaway.log"), \$process->getOutput().\$process->getErrorOutput());
expect(\$process->getExitCode())->toBe(0, $(php_string "cutaway failed; see $work/cutaway.log"));
PHP
}

# shellcheck disable=SC2016 # PHP source in single quotes
if [[ ${1:-} == --self-test && $# == 1 ]]; then
  dir=$(mktemp -d)
  trap 'rm -rf "$dir"' EXIT
  fail() { echo "self-test failed: $1" >&2; exit 1; }
  rejects() {
    printf '%s' "$2" >"$dir/bad.json"
    if check_plan "$dir/bad.json" 2>"$dir/err"; then fail "accepted $1"; fi
    [[ -s $dir/err ]] || fail "no message for $1"
  }

  rejects 'missing path' '{"steps":[{"action":"wait"}]}'
  rejects 'relative path' '{"path":"operations","steps":[{"action":"wait"}]}'
  rejects 'absolute url' '{"path":"/","url":"http://x","steps":[{"action":"wait"}]}'
  rejects 'empty steps' '{"path":"/","steps":[]}'
  rejects 'click without expect' '{"path":"/","steps":[{"action":"click","selector":"#a"}]}'
  rejects 'press without expect' '{"path":"/","steps":[{"action":"press","key":"Enter"}]}'
  rejects 'unknown step key' '{"path":"/","steps":[{"action":"type","selecter":"#a","text":"x"}]}'
  rejects 'custom viewport' '{"path":"/","viewport":{"width":800,"height":600},"steps":[{"action":"wait"}]}'
  rejects 'unknown plan key' '{"path":"/","speed":2,"steps":[{"action":"wait"}]}'

  mkdir "$dir/plan" && : >"$dir/plan/doc.pdf"
  cat >"$dir/plan/plan.json" <<'JSON'
{"path": "/it's", "colorScheme": "dark", "steps": [
  {"action": "type", "selector": "input[type=\"search\"]", "text": "Tilleuls"},
  {"action": "tap", "selector": "role=row[name=\"x\"]", "expect": "text=Summary"},
  {"action": "upload", "selector": "#file", "file": "doc.pdf", "expect": "#done"}
]}
JSON
  printf '%s\n' '$user = \App\Models\User::factory()->create();' '$this->actingAs($user);' >"$dir/setup.php"
  check_plan "$dir/plan/plan.json" || fail 'rejected a valid plan'
  snippet=$(render_snippet "$dir/plan/plan.json" "$dir/setup.php" /home/u/work /home/u/.cutaway/src/cli.mjs)
  for expected in \
    '$this->actingAs($user);' \
    "visit('/it\\'s')" \
    '"file":["'"$dir"'/plan/doc.pdf"]' \
    '"colorScheme":"dark"' \
    "'/home/u/.cutaway/src/cli.mjs', 'record', '/home/u/work/plan.json', '--out', '/home/u/work/recording'" \
    "'--fps', '30'" \
    '$page->wait(0.2)'; do
    [[ $snippet == *"$expected"* ]] || fail "snippet lacks: $expected"
  done
  [[ $snippet != *'<?php'* ]] || fail 'snippet must be a bare --agent body'
  echo 'record self-test passed'
  exit 0
fi

(($# == 3)) || usage
plan=$1 setup=$2 output=$3
[[ -f $plan && -f $setup && $output == *.webm ]] || usage
for tool in jq node php; do
  command -v "$tool" >/dev/null || { echo "$tool is required" >&2; exit 2; }
done
[[ -x vendor/bin/pest ]] || { echo 'Run from the Laravel project root: vendor/bin/pest not found' >&2; exit 2; }
cutaway=${CUTAWAY_HOME:-$HOME/.cutaway}
cli=$cutaway/src/cli.mjs
[[ -f $cli ]] || { echo "cutaway not found at $cutaway; see the skills README" >&2; exit 2; }
ffmpeg=$cutaway/node_modules/ffmpeg-static/ffmpeg
[[ -x $ffmpeg ]] || { echo "cutaway's bundled ffmpeg not found at $ffmpeg" >&2; exit 2; }
check_plan "$plan" || exit 2

# Under lerd, PHP runs in a container that shares $HOME but not /tmp, so the work directory lives in the cache.
cache=$HOME/.cache/publish-evidence
mkdir -p "$cache"
work=$(mktemp -d "$cache/record.XXXXXX")
trap '(($? == 0)) || echo "record: failed; snippet and logs kept in $work" >&2' EXIT
resolved_plan "$plan" | jq '.url = "http://localhost" + .path | del(.path)' >"$work/probe.json"
node "$cli" validate "$work/probe.json" >/dev/null || exit 2

render_snippet "$plan" "$setup" "$work" "$cli" >"$work/snippet.php"
if ! php vendor/bin/pest --agent="$(<"$work/snippet.php")" >"$work/pest.log" 2>&1; then
  tail -n 40 "$work/pest.log" >&2
  [[ ! -f $work/cutaway.log ]] || tail -n 20 "$work/cutaway.log" >&2
  exit 1
fi

mkdir -p "$(dirname "$output")"
"$ffmpeg" -hide_banner -loglevel error -y -i "$work/recording/video.mp4" \
  -c:v libvpx-vp9 -crf 34 -b:v 0 -row-mt 1 -deadline good -cpu-used 4 -an "$output"
frames=${output%.webm}-frames
mkdir -p "$frames"
rm -f "$frames"/frame-*.png
"$ffmpeg" -hide_banner -loglevel error -i "$output" -vf fps=1 "$frames/frame-%02d.png"
"$ffmpeg" -hide_banner -loglevel error -y -sseof -0.5 -i "$output" -frames:v 1 "$frames/frame-last.png"
rm -rf "$work"
printf 'video: %s\nframes: %s\n' "$output" "$frames"
