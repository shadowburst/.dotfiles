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
    # ente-auth
    gimp
    nautilus
    pdfarranger
    simple-scan
  ];
}
