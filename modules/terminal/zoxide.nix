{ ... }:
{
  flake.homeModules.zoxide =
    { lib, pkgs, ... }:
    {
      programs.zoxide = {
        enable = true;
        options = [
          "--cmd cd"
        ];
      };
    };
}
