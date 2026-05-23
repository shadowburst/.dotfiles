# Validation

Deterministic checks for this repository:

- Check the broader dotfiles flake with `nix flake check` when repository-level Nix changes or full readiness evidence is needed.
- For Pi Prompt Template changes, verify the files are linked by the Home Manager Pi module and manually inspect the rendered prompt text for the expected workflow.
