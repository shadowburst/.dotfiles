_: {
  flake.homeModules.cli =
    { pkgs, ... }:
    {
      programs.codex = {
        enable = true;
        mutableSettings = true;
        settings.features.hooks = true;
        # A store-path string lets Home Manager read the plugin name and version from its manifest.
        plugins = [ "${pkgs.ponytail.src}" ];
      };
    };
}
