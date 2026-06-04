_: {
  flake.homeModules.codex =
    { ... }:
    {
      programs.codex = {
        enable = true;
        settings = {
          approval_policy = "never";
          sandbox_mode = "danger-full-access";
        };
      };
    };
}
