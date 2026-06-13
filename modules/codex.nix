_: {
  flake.homeModules.cli =
    { ... }:
    {
      programs.codex.enable = true;
    };
}
