_: {
  flake.homeModules.cli =
    { pkgs, ... }:
    {
      # Resume restores saved permissions unless the CLI overrides them.
      home.shellAliases.codex = "codex --yolo";

      programs.codex = {
        enable = true;
        mutableSettings = true;
        context = ''
          Reply in ASD-STE100 Simplified Technical English.

          During grilling sessions, ask every round through the `question` tool, batching the whole frontier into one call.
        '';
        settings = {
          approval_policy = "never";
          sandbox_mode = "danger-full-access";
          features.hooks = true;
        };
        # A store-path string lets Home Manager read the plugin name and version from its manifest.
        plugins = [ "${pkgs.ponytail.src}" ];
      };
    };
}
