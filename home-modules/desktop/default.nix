{ pkgs, ... }:

{
  imports = [
    ./ags
    ./discord
    ./hyprland
    ./kanshi
    ./kitty
    ./mpv
    ./transmission
  ];

  home.sessionVariables = {
    BROWSER = "brave";
  };

  home.packages = with pkgs; [
    brave
    gimp
    nautilus
    simple-scan
  ];
}
