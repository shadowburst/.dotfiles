# Ralph uses Automatic Handoff for worktree entry

Ralph will prefer Automatic Handoff when a `/ralph` command is invoked outside the Ralph worktree: it starts a replacement Pi process rooted in the worktree and reruns the Ralph command there. This is a deliberate best-effort process handoff rather than an in-process cwd switch because Pi does not expose a safe command-context API for replacing the active runtime with a different cwd; Ralph keeps Manual Handoff as the fallback when Automatic Handoff is disabled, unavailable, already attempted, or fails.
