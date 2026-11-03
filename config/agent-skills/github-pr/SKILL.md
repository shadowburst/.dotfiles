---
name: github-pr
description: Use when reading PR review feedback, resolving review threads, waiting on a PR, or posting a PR comment.
---

# GitHub PR

The scripts below need `gh` (authenticated), `jq`, and `python3`.

## Collect feedback

```bash
<skill-directory>/scripts/collect-reviews.sh PR_URL
```

Prints JSON with `.pr` (including `head_sha`) and `.feedback`: every submitted review and review comment, paginated, with `kind`, `id`, `thread_id`, `in_reply_to_id`, `resolved`, and `body`. A nonzero exit means a page could not be collected; stop rather than work from partial feedback. Ordinary PR conversation is outside its scope: paginate `repos/OWNER/REPO/issues/NUMBER/comments` separately when it matters.

## Resolve threads

```bash
<skill-directory>/scripts/resolve-threads.sh PR_URL HEAD_SHA PLAN.json '<model> on behalf of <login>'
```

`PLAN.json` is a nonempty array of `{thread_id, disposition, evidence}` with disposition `addressed` (the head demonstrably implements the request) or `obsolete` (the concern demonstrably no longer applies). The script stops when the PR head moves, replies once per thread with the [comment](#comments) note, and resolves the thread. Rerun the same plan after a failure; replies already posted are skipped.

## Wait for events

```bash
<skill-directory>/scripts/pr-wait <pr> [--repo owner/name] [--until ready|green|any-change]
```

One watcher per PR; it prints one line per real event (failed check, all checks done, new comment, review or thread, bot finished, base moved onto this PR's files, BEHIND or DIRTY, merged or closed).

- `ready` (default): required checks green, Greptile or Macroscope reviewed the head, no unresolved threads. Use `green` when the repo has neither bot.
- Exit 0: condition met or PR merged. Exit 1: needs action. Exit 2: bad input or another watcher holds the PR.
- In Claude Code, run it with the `Monitor` tool (`timeout_ms: 3600000`) so each line wakes you; elsewhere, run it as one long command. Start it again after each push, after handling an exit 1, and after a resume; it remembers what it already reported.

When GraphQL is used up (`gh api rate_limit --jq .resources.graphql`), read through REST: `gh api repos/<owner>/<repo>/pulls/<n>` and `.../commits/<sha>/check-runs`.

## Comments

Start every comment an agent posts on the user's behalf with this note:

```md
> [!NOTE]
> 🤖 **<model> on behalf of <user>**

The comment starts here.
```

Use the model name the harness reports (or the harness name when it reports none) and the user's GitHub login. The note covers top-level PR comments, inline comments, replies to bots and reviewers, and reasons written before resolving or dismissing feedback. PR descriptions, commit messages, submitted review bodies, and text the user asked to post verbatim keep their own format.

Lead with the conclusion, cite the code, check, or reproduction, and separate verified facts from judgment. Check the whole comment for secrets and private details, build request JSON with `jq`, confirm GitHub returned the comment URL, and resolve a thread only after its reply is posted.
