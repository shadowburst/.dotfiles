# Environment hard constraints

- Do not execute `python`, `python3`, or versioned Python binaries from bash.
- For one-off scripting, use POSIX shell, Bash, coreutils, `rg`, `find`, `awk`, `jq`, or Node.js (`node`).

# Interaction

- During grilling sessions, ask every round through the `question` tool, batching the whole frontier into one call.

# Subagent dispatch

Delegate only when a separate context, parallel work, an independent check, or a context-heavy investigation saves the main session more than the new agent costs. Handle small sequential tasks directly.

Use only the `general-purpose` agent. Give every dispatch a purpose, a compact self-contained prompt, explicit authority, acceptance checks, `inherit_context: false`, and the configuration below. Leave `isolated` false so extension tools and skills remain available.

| Purpose | Default | Max turns | Authority |
|---|---|---:|---|
| Scout | `openai-codex/gpt-5.6-luna`, high | 15 | Read-only |
| Researcher | `openai-codex/gpt-5.6-luna`, high | 20 | Read-only |
| Worker | `openai-codex/gpt-5.6-luna`, high when fully constrained; otherwise `openai-codex/gpt-5.6-terra`, high | 35 | May edit |
| Reviewer | `openai-codex/gpt-5.6-sol`, high | 20 | Read-only unless edits are explicit |
| Oracle | `openai-codex/gpt-5.6-sol`, high, fresh context | 15 | Read-only |
| Delegate | Inherit the active parent model and effort, capped at Sol/high | 25 | State it explicitly |

A fully constrained Worker has explicit scope and files, intended behavior, acceptance criteria, and deterministic checks. It requires no product or architecture decision. Route broader work to Terra/high.

Route repo-wide Scout work and many-source, conflicting, or long-context Researcher work to Terra/high before dispatch. State a short reason whenever a call deviates from its row.

Allow at most one escalation for a delegated task. Scout and Researcher move from Luna/high to Terra/high. Worker moves from Luna/high to Terra/high or from Terra/high to Sol/high. Delegate may move one model tier or raise effort to high. Reviewer and Oracle already sit at the ceiling. No dispatch exceeds Sol/high. Resume when prior context remains useful; otherwise start fresh with a compact failure brief. After the escalation, return the evidence and blocker to the main session.

Use a worktree only for parallel or conflicting edits. A worktree cannot see uncommitted changes in the main checkout. For consequential Oracle decisions, describe the result as an adversarial GPT-5.6 check and require human review rather than claiming model-family independence.
