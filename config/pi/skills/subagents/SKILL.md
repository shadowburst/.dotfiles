---
name: subagents
description: Subagents: use before dispatching a Pi subagent or when another skill proposes one; decide whether delegation helps and select an eligible model and effort.
---

# Subagents

Apply before every Pi `Agent` call, including calls proposed by another skill.

## Delegate only useful, independent work

Delegate work that is self-contained, independent, and has a clear deliverable. Keep short or dependent steps in the parent. Use the fewest agents that help, and give each a bounded task with an expected result.

## Choose a model

Use a model available in the current Pi session's scope and pass its full `provider/model` ID. `Agent` requires a model and effort, and validates both against the session's scoped models. If no scope is configured, choose from the current available catalog:

- **GPT-6 Luna** (`openai-codex/gpt-6-luna` when available): well-specified work with clear requirements and acceptance criteria.
- **GPT-6 Sol** (`openai-codex/gpt-6-sol` when available): open-ended judgment, especially architectural decisions.
- **GPT-6 Astra** (`openai-codex/gpt-6-astra` when available): exceptionally complex work only. Use Astra only when the user explicitly requests it for this subagent task. If Astra would materially improve the result, ask the user and wait for approval. General requests for thoroughness or quality are not approval. Approval applies only to the named task. Without approval, use Sol for independent judgment, otherwise Luna.

Prefer the least capable eligible model that can do the work. If a preferred model is unavailable, choose the best model permitted by scope and the Astra approval rule. Never invent or guess model IDs.

## Choose effort

Choose effort based on the task, not the parent session's current level:

- **low** for narrow lookups, reconnaissance, and tightly specified execution.
- **medium** for substantive analysis, implementation, or research.
- **high** for difficult debugging, complex reasoning, or open-ended design.
- **xhigh** only when unusually demanding work makes the extra reasoning worthwhile.
- **Never use `max` for a subagent**, even when supported.

Task-specific guidance takes precedence over Pi's configured `modelThinkingLevels`. Consult the applicable Pi settings only when the task does not indicate an effort. Use only effort levels supported by the selected model; if the chosen level is unsupported, use the nearest lower supported level.
