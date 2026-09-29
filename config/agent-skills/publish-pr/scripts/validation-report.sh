#!/usr/bin/env bash
set -euo pipefail
cd -- "$(git rev-parse --show-toplevel)"
shopt -s nullglob
scripts=(scripts/ci/*.sh)
((${#scripts[@]})) || exit 0
sha=$(git rev-parse HEAD)
printf '## Validation\n\nTested head: `%s`\n\n| Check | Result |\n| --- | --- |\n' "$sha"
failed=0
for script in "${scripts[@]}"; do
    printf '\nRunning %s\n' "$script" >&2
    if bash "$script" >&2; then result='✅ Pass'
    else result='❌ Fail'; failed=1; fi
    name=$(printf '%s' "${script##*/}" | tr '\r\n|`<>' '______')
    printf '| `%s` | %s |\n' "$name" "$result"
done
if [[ $(git rev-parse HEAD) != "$sha" ]] || ! git diff --quiet HEAD --; then
    printf '| Checkout changed during checks | ❌ Fail |\n'
    failed=1
fi
result='✅ Pass'
((failed == 0)) || result='❌ Fail'
printf '| **Overall** | %s |\n' "$result"
exit "$failed"
