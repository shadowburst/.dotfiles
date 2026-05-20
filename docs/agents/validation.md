# Validation

Deterministic checks for this repository:

- Validate the Forge Pi extension with `npm test --prefix config/pi/extensions/forge` once the extension test package exists.
  This should cover command registration/loading, Feature Spec task parsing, programmatic chain invocation shape, final JSON parsing, checkbox updates, commit safety, and finalization behavior.
- Check the broader dotfiles flake with `nix flake check` when repository-level Nix changes or full readiness evidence is needed.
