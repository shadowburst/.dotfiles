{ self, ... }:
{
  flake.nixosModules.hypr =
    { lib, pkgs, ... }:
    {
      imports = [
        self.nixosModules.hyprland
      ];

      programs.seahorse.enable = true;

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
        self.homeModules.hyprland
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
