{
  lib,
  pkgs,
  ...
}: let
  launch-default = pkgs.writeShellScriptBin "launch-default" (lib.fileContents ./bin/launch-default);
in {
  imports = [
    ./dms
    ./hypridle.nix
    ./hyprland.nix
    ./shikane.nix
  ];

  home.packages = with pkgs; [
    launch-default

    nautilus
    gnome-calculator
    pavucontrol
    socat
    wdisplays
  ];

  home.sessionVariables.NIXOS_OZONE_WL = "1";
}
