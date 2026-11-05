_: {
  flake.homeModules.cli =
    { pkgs, ... }:
    {
      programs.codex = {
        enable = true;
        mutableSettings = true;
        context = ''
          Reply in ASD-STE100 Simplified Technical English.

          During grilling sessions, ask every round through the `question` tool, batching the whole frontier into one call.
        '';
        settings.features.hooks = true;
        # A store-path string lets Home Manager read the plugin name and version from its manifest.
        plugins = [ "${pkgs.ponytail.src}" ];
      };
    };
}
