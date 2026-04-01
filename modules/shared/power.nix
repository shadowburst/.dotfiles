{ ... }:
{
  flake.nixosModules.power =
    { lib, pkgs, ... }:
    {
      services.power-profiles-daemon.enable = true;
      services.upower.enable = true;
    };
}
