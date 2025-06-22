{
  lib,
  pkgs,
  ...
}: let
  launch-default = pkgs.writeShellScriptBin "launch-default" (lib.fileContents ./bin/launch-default);
in {
  imports = [
    ./hypridle.nix
    ./hyprland.nix
    ./quickshell.nix
    ./shikane.nix
  ];

  home.packages = with pkgs; [
    launch-default

    nautilus
    gnome-calculator
    grim
    htop
    hyprpicker
    pavucontrol
    playerctl
    socat
    swappy
    wdisplays
    wl-clipboard
  ];

  services.blueman-applet.enable = true;
  services.hyprpolkitagent.enable = true;
  services.network-manager-applet.enable = true;
}
