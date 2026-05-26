{ self, ... }:
{
  flake.nixosModules.hypr =
    { lib, pkgs, ... }:
    {
      imports = [
        self.nixosModules.hyprland
        self.nixosModules.hyprwhspr-rs
      ];

      programs.seahorse.enable = true;

      services.greetd = {
        enable = true;
        settings.default_session.command = "${pkgs.tuigreet}/bin/tuigreet --time --time-format '%A %e, %B %Y' --remember --asterisks --cmd 'uwsm start default'";
      };

      services.gnome.gnome-keyring.enable = true;

      security.pam.services.greetd.enableGnomeKeyring = true;
    };

  flake.homeModules.hypr =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    {
      imports = [
        self.homeModules.hypridle
        self.homeModules.hyprland
        self.homeModules.hyprwhspr-rs
        self.homeModules.shikane
      ];

      home.sessionPath = [ "$HOME/.local/bin" ];

      home.packages = with pkgs; [
        nautilus
        gnome-calculator
        hyprpicker
        hyprshot
        pavucontrol
        socat
        satty
        wdisplays
        wl-clipboard
      ];

      # Fix screensharing double menu
      xdg.configFile."hypr/xdph.conf".text = /* hyprlang */ ''
        screencopy {
          allow_token_by_default = true
        }
      '';

      home.sessionVariables.NIXOS_OZONE_WL = "1";
    };
}
