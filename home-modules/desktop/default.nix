{ pkgs, ... }:

{
  imports = [
    ./ags
    ./discord
    ./hyprland
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
    pdfarranger
    simple-scan
  ];
}
