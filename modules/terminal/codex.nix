_: {
  flake.homeModules.codex =
    { ... }:
    {
      programs.codex = {
        enable = true;
        enableMcpIntegration = true;
        settings = {
          approval_policy = "never";
          sandbox_mode = "danger-full-access";
        };
      };
    };
}
