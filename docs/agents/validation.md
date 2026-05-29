# Validation

Deterministic checks for this repository:

- Check the broader dotfiles flake with `nix flake check` when repository-level Nix changes or full readiness evidence is needed.
- For Pi skill or extension configuration changes, verify the linked files in the Home Manager Pi module and inspect the loaded workflow instructions for stale names.
