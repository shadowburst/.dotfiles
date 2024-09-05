{ pkgs, ... }:

{
  imports = [
    ./ags
    ./hyprland
    ./kanshi
    ./kitty
    ./mpv
  ];

  home.sessionVariables = {
    BROWSER = "brave";
  };

  home.packages = with pkgs; [
    brave
    discord
    gimp
    nautilus
    simple-scan
  ];
}
