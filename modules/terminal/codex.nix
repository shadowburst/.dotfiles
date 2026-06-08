_: {
  flake.homeModules.codex =
    { ... }:
    {
      programs.codex = {
        enable = true;
        enableMcpIntegration = true;
      };
    };
}
