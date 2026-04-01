{ ... }:
{
  flake.homeModules.btop =
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
