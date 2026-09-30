#!/usr/bin/env bash
set -euo pipefail
cd -- "$(git rev-parse --show-toplevel)"
shopt -s nullglob
scripts=(scripts/ci/*.sh)
((${#scripts[@]})) || exit 0
sha=$(git rev-parse HEAD)
printf '## Validation\n\nTested head: `%s`\n\n| Check | Result | Time |\n| --- | --- | --- |\n' "$sha"
# ponytail: whole-second timing; use a finer clock if sub-second checks matter.
format_duration() {
    if (($1 < 60)); then printf '%ss' "$1"
    else printf '%sm %ss' "$(($1 / 60))" "$(($1 % 60))"; fi
}
started=$SECONDS
failed=0
for script in "${scripts[@]}"; do
    printf '\nRunning %s\n' "$script" >&2
    check_started=$SECONDS
    if bash "$script" >&2; then result='✅'
    else result='❌'; failed=1; fi
    elapsed=$((SECONDS - check_started))
    name=$(printf '%s' "${script##*/}" | tr '\r\n|`<>' '______')
    printf '| `%s` | %s | %s |\n' "$name" "$result" "$(format_duration "$elapsed")"
done
if [[ $(git rev-parse HEAD) != "$sha" ]] || ! git diff --quiet HEAD --; then
    printf '| Checkout changed during checks | ❌ | — |\n'
    failed=1
fi
result='✅'
((failed == 0)) || result='❌'
printf '| **Overall** | %s | %s |\n' "$result" "$(format_duration "$((SECONDS - started))")"
exit "$failed"
