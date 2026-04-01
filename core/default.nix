{ inputs, self, ... }:
{
  flake.stateVersion = "26.05";

  imports = [ inputs.home-manager.flakeModules.home-manager ];

  flake.nixosModules.core =
    { lib, pkgs, ... }:
    {
      system.stateVersion = self.stateVersion;

      nixpkgs.config.allowUnfree = true;

      environment.pathsToLink = [
        "/share/applications"
        "/share/xdg-desktop-portal"
      ];

      nix.gc.automatic = true;
      nix.gc.dates = "weekly";
      nix.gc.options = "--delete-older-than 7d";

      nix.settings.auto-optimise-store = true;
      nix.settings.experimental-features = [
        "nix-command"
        "flakes"
      ];

      programs.nix-ld.enable = true;

      time.timeZone = "Europe/Paris";
      i18n.defaultLocale = "en_GB.UTF-8";
      i18n.extraLocaleSettings = {
        LC_ADDRESS = "en_GB.UTF-8";
        LC_IDENTIFICATION = "en_GB.UTF-8";
        LC_MEASUREMENT = "en_GB.UTF-8";
        LC_MONETARY = "en_GB.UTF-8";
        LC_NAME = "en_GB.UTF-8";
        LC_NUMERIC = "en_GB.UTF-8";
        LC_PAPER = "en_GB.UTF-8";
        LC_TELEPHONE = "en_GB.UTF-8";
        LC_TIME = "en_GB.UTF-8";
      };

      security.rtkit.enable = true;
      security.polkit.enable = true;

      services.devmon.enable = true;
      services.fstrim.enable = true;
      services.gvfs.enable = true;
      services.udisks2.enable = true;
    };

  flake.homeModules.core =
    { lib, pkgs, ... }:
    {
      home.stateVersion = self.stateVersion;

      programs.home-manager.enable = true;

      xdg.enable = true;
    };
}
