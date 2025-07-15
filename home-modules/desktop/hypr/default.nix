{
  lib,
  pkgs,
  ...
}: let
  launch-default = pkgs.writeShellScriptBin "launch-default" (lib.fileContents ./bin/launch-default);
in {
  imports = [
    ./caelestia
    ./hypridle.nix
    ./hyprland.nix
    ./shikane.nix
  ];

  home.packages = with pkgs; [
    launch-default

    nautilus
    gnome-calculator
    htop
    hyprpicker
    pavucontrol
    playerctl
    socat
    wdisplays
    wl-clipboard
  ];

  services.blueman-applet.enable = true;
  services.hyprpolkitagent.enable = true;
  services.network-manager-applet.enable = true;

  home.sessionVariables = {
    NIXOS_OZONE_WL = "1";
  };
}
