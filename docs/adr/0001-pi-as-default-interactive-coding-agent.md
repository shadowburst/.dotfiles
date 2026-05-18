# Pi as default interactive coding agent

Pi is the default interactive coding agent for project sessions and Neovim integration, while opencode remains installed as a fallback during the transition. This keeps the main workflow on Pi, replaces `opencode.nvim` with the simpler prompt-oriented `pi.nvim`, and avoids making opencode the default just because some fallback configuration still exists.

## Consequences

- Project session bootstrap opens Pi, not `opencode --port`.
- Neovim uses `pi.nvim` with its default settings and the two documented `PiAsk` keymaps.
- Global Pi provider and model defaults remain in `config/pi/settings.json`.
- Worktrunk commit-message automation uses Pi print mode with an explicit cheap non-thinking model instead of inheriting interactive defaults.
- Opencode stays installed/configured for rollback or manual use, but no default workflow should start it.
