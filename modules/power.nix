_: {
  flake.nixosModules.core =
    { lib, pkgs, ... }:
    {
      services.power-profiles-daemon.enable = true;
      services.upower.enable = true;
    };
}
