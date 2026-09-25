---
name: subagents
description: use before dispatching a Pi subagent or when another skill proposes one; decide whether delegation helps and select an eligible model and effort.
---

# Subagents

Apply before every Pi `Agent` call, including calls proposed by another skill.

## Delegate only useful, independent work

Delegate work that is self-contained, independent, and has a clear deliverable. Keep short or dependent steps in the parent. Use the fewest agents that help, and give each a bounded task with an expected result.

## Choose a model–effort pair

Use a model in the current Pi session's scope (or available catalog if no scope is configured), its full `provider/model` ID, and an effort it supports. `Agent` validates both. Choose the lightest pair likely to succeed in one pass, based on the task rather than the parent's effort:

| Model (when available)             | Effort | Task fit                                            |
| ---------------------------------- | ------ | --------------------------------------------------- |
| Luna (`openai-codex/gpt-6-luna`)   | medium | Bounded lookups, clear briefs, well-specified edits |
| Luna                               | high   | Harder coordinated updates with clear constraints   |
| Luna                               | xhigh  | Constrained work spanning multiple contexts         |
| Sol (`openai-codex/gpt-6-sol`)     | low    | Focused checking or editing                         |
| Sol                                | medium | Everyday coding, research, or work needing judgment |
| Sol                                | high   | Difficult debugging, design, or reasoning           |
| Sol                                | xhigh  | Deep verification or demanding code/security review |
| Astra (`openai-codex/gpt-6-astra`) | medium | Ambitious end-to-end work with broad context        |
| Astra                              | high   | Especially difficult broad-context work             |
| Astra                              | xhigh  | Exacting analysis or complex deliverables           |

Prefer Sol when independent judgment is needed rather than escalating Luna just for more reasoning. Reserve xhigh for work where the extra cost and latency are worthwhile. These are defaults, not an exhaustive list: adjust within supported levels when the task justifies it. Use Luna low only on explicit request; never use `max` for a subagent.

Astra requires the user's explicit approval for the named subagent task. If it would materially improve the result, ask and wait; general requests for quality or thoroughness are not approval. Without approval, use Sol for independent judgment, otherwise Luna.

If the preferred pair is unavailable, try another eligible supported pair; if none meets the quality bar, keep the work in the parent or ask. Never invent model IDs or silently downgrade below the task's needs.
