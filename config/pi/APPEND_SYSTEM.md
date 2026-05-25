# Environment hard constraints

Python is not available in this environment.

- Do not execute `python`, `python3`, or versioned Python binaries from bash.
- Do not retry with `python3` after `python` fails, or retry with `python` after `python3` fails.
- For one-off scripting, use POSIX shell, Bash, coreutils, `rg`, `find`, `awk`, `jq`, `perl`, or Node.js (`node`).
- For reading/editing files, prefer pi's `read` and `edit` tools instead of generating Python helper scripts.
