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
    if ((failed)); then
        result='⏭️'
        duration='—'
    else
        printf '\nRunning %s\n' "$script" >&2
        check_started=$SECONDS
        if bash "$script" >&2; then result='✅'
        else result='❌'; failed=1; fi
        duration=$(format_duration "$((SECONDS - check_started))")
    fi
    name=$(printf '%s' "${script##*/}" | tr '\r\n|`<>' '______')
    printf '| `%s` | %s | %s |\n' "$name" "$result" "$duration"
done
# The full-suite row: the approved full run, or after it the focused rerun (see SKILL.md step 7).
if jq -e '.scripts.test' composer.json >/dev/null 2>&1; then
    full_suite=()
    if [[ ${FULL_SUITE_APPROVED:-} == 1 ]]; then full_suite=(composer test)
    elif [[ -n ${FULL_SUITE_FILES:-} ]]; then read -ra files <<<"$FULL_SUITE_FILES"; full_suite=(php artisan test --compact "${files[@]}")
    fi
    if ((${#full_suite[@]})); then
        if ((failed)); then
            result='⏭️'
            duration='—'
        else
            printf '\nRunning %s\n' "${full_suite[*]}" >&2
            check_started=$SECONDS
            if "${full_suite[@]}" >&2; then result='✅'
            else result='❌'; failed=1; fi
            duration=$(format_duration "$((SECONDS - check_started))")
            # Later heads rerun only the tests of the commits since this run.
            [[ ${FULL_SUITE_APPROVED:-} != 1 ]] || git config "branch.${PR_HEAD_BRANCH:-$(git branch --show-current)}.full-suite-sha" "$sha"
        fi
        printf '| `full-suite` | %s | %s |\n' "$result" "$duration"
    fi
fi
if [[ $(git rev-parse HEAD) != "$sha" ]] || ! git diff --quiet HEAD --; then
    printf '| Checkout changed during checks | ❌ | — |\n'
    failed=1
fi
result='✅'
((failed == 0)) || result='❌'
printf '| **Overall** | %s | %s |\n' "$result" "$(format_duration "$((SECONDS - started))")"
exit "$failed"
