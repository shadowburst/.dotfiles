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
    ./noctalia
    ./shikane.nix
  ];

  home.packages = with pkgs; [
    launch-default

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

  services.hyprpolkitagent.enable = true;

  # Fix screensharing double menu
  xdg.configFile."hypr/xdph.conf".text = ''
    screencopy {
      allow_token_by_default = true
    }
  '';

  home.sessionVariables.NIXOS_OZONE_WL = "1";
}
