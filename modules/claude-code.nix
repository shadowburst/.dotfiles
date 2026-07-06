_: {
  flake.homeModules.cli =
    { ... }:
    {
      programs.claude-code = {
        enable = true;
      };
    };
}
