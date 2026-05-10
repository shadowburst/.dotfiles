---
name: to-epic
description: Turn the current conversation context into an epic issue plus the minimum number of dependency-ordered sub-issues, and publish them to the project issue tracker. Use when the user wants to create an epic from the current context.
---

# To Epic

Synthesize the current context into one epic issue and the minimum set of dependency-ordered sub-issues, then publish them. Do NOT interview the user — work from what is already in context.

## Process

### 1. Explore (only if needed)

If you have not already explored the codebase relevant to this work, do so now. Use the project's domain glossary vocabulary throughout, and respect any ADRs in the area you're touching.

### 2. Check for existing open epics or issues

Before drafting anything, list open work that may already cover this:

- `gh issue list --state open --label epic --json number,title,body,labels`
- A second search by topic/keyword across all open issues for the feature area in question.

If anything looks like it might overlap, present the candidates to the user and ask whether to **update** an existing epic / sub-issues instead of creating a new set. Only proceed to step 3 once the user confirms a new epic is the right move (or picks a target to update).

If updating an existing epic, edit its body to incorporate the new context, and add or revise sub-issues as needed — do not duplicate.

### 3. Draft the epic and sub-issues

Draft the epic body using the template below. The epic title MUST follow Conventional Commits (`feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`, etc.) — for example, `feat: tier-gated team member cap`. Optional scope is allowed, e.g. `feat(billing): ...`.

Then break the work into the **minimum** number of sub-issues that can each be picked up independently, in dependency order. Sub-issue titles also follow Conventional Commits.

<sub-issue-rules>
- Prefer fewer, thicker slices over many thin ones — only split when a real dependency boundary or hand-off forces it.
- Each sub-issue must be self-contained: an agent picking it up should have every piece of context needed to implement it without re-reading the epic or this conversation. Repeat relevant constraints, decisions, and pointers inline.
- Sub-issues are ordered by dependency. Earlier sub-issues unblock later ones.
- Each sub-issue cuts end-to-end through whatever layers it touches (schema → API → UI → tests), not a horizontal slice of one layer.
</sub-issue-rules>

### 4. Show the breakdown for approval

Present the plan to the user as:

- **Epic title** (Conventional Commits format) and a one-paragraph summary.
- **Sub-issues**: a numbered list in dependency order. For each:
  - Title (Conventional Commits format)
  - One-sentence "what to build"
  - Blocked by (which earlier sub-issue numbers, if any)

Ask the user:

- Does the granularity feel right? Any sub-issues to merge or split?
- Are the dependencies correct?
- Anything missing from the epic's user stories or context?

Iterate until the user approves. Only then proceed to publish.

### 5. Publish

Every `#N` reference in any published body MUST be a real GitHub issue number returned by the tracker — never a placeholder, draft index, or position in your sub-issue list. If you don't yet have the real number, do not write the reference: publish in the order below so the number exists by the time you need it, and pull each number from the `gh issue create` output (e.g. the URL's trailing path segment).

Publish in this order so you can reference real issue numbers:

1. **Epic first.** Apply labels `epic` and `needs-triage`. Capture its issue number. Leave the `## Sub-issues` section empty for now (a placeholder line is fine).
2. **Sub-issues, in dependency order.** Each sub-issue body must include a `## Parent` section linking the epic, and a `## Blocked by` section referencing the real issue numbers of any blocking sub-issues. Apply label `needs-triage` to each sub-issue (do NOT apply `epic`). Capture each issue number.
3. **Backfill the epic.** Edit the epic body (`gh issue edit <epic-number> --body ...`) to populate `## Sub-issues` with a GitHub task-list referencing each sub-issue by number, in dependency order:

   ```
   - [ ] #123 — feat: ...
   - [ ] #124 — feat: ...
   ```

   GitHub auto-checks these boxes when the referenced issues close, giving the epic a live status view.

Do NOT close or modify any pre-existing issues unless step 2 confirmed an update path.

## Templates

<epic-template>
## Summary

One-paragraph global view of the feature or fix from the user's perspective.

## User Stories

A numbered list covering all aspects of the work:

1. As a <actor>, I want <feature>, so that <benefit>
2. ...

## Context & Decisions

Anything an implementer should be aware of across the whole epic:

- Relevant domain vocabulary and ADRs
- Architectural decisions already made in conversation
- Schema / API / interface decisions
- Constraints (security, performance, compatibility)

## Out of Scope

Things explicitly NOT covered by this epic.

## Sub-issues

- [ ] #<real-issue-number> — <title>
- [ ] #<real-issue-number> — <title>
</epic-template>

<sub-issue-template>
## Parent

#<real-epic-issue-number> — <epic-title>

## What to build

A concise description of this slice's end-to-end behavior.

## Context

Everything needed to implement this slice without reading the epic or any other ticket. Include:

- Relevant domain vocabulary and ADRs
- Decisions from the epic that apply here
- Pointers to existing code, modules, or patterns to follow
- Any constraints specific to this slice

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Blocked by

- #<real-issue-number> — <title>

Or "None — can start immediately."
</sub-issue-template>
