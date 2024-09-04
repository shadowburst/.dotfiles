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
    gnome-calculator
    nautilus
    simple-scan
    pavucontrol
    sway-contrib.grimshot
    wdisplays
  ];
}
