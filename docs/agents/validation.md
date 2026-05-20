# Validation

Deterministic checks for this repository:

- Validate the Ralph Pi extension with `npm test --prefix config/pi/extensions/ralph-loop`.
  This covers command registration/loading, Orchestrator subprocess launch behavior, task parsing, cache persistence and cleanup, git safety, phase transitions, and Ralph validation discovery.
- Check the broader dotfiles flake with `nix flake check` when repository-level Nix changes or full readiness evidence is needed.
