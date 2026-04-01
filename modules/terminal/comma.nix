{ inputs, ... }:
{
  flake.homeModules.comma =
    { lib, pkgs, ... }:
    {
      imports = [ inputs.nix-index-database.homeModules.nix-index ];

      programs = {
        nix-index.enable = true;
        nix-index-database.comma.enable = true;
      };
    };
}
