_: {
  flake.nixosModules.gaming =
    { lib, pkgs, ... }:
    {
      programs.gamemode.enable = true;

      programs.steam = {
        enable = true;
        gamescopeSession.enable = true;
        remotePlay.openFirewall = true;
      };

      hardware.steam-hardware.enable = true;
    };
}
