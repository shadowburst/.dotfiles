_: {
  flake.homeModules.cli =
    { pkgs, ... }:
    {
      programs.codex = {
        enable = true;
        mutableSettings = true;
        context = ''
          During grilling sessions, ask every round through the `question` tool, batching the whole frontier into one call.

          Reply in ASD-STE100 Simplified Technical English.
        '';
        settings.features.hooks = true;
        # A store-path string lets Home Manager read the plugin name and version from its manifest.
        plugins = [ "${pkgs.ponytail.src}" ];
      };
    };
}
