_: {
  flake.homeModules.cli =
    { lib, pkgs, ... }:
    {
      programs.btop = {
        enable = true;
        settings = {
          theme_background = false;
        };
      };
    };
}
