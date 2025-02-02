{pkgs, ...}: {
  imports = [
    ./ags
    ./discord.nix
    ./hyprland
    ./kitty.nix
    ./mpv.nix
    ./nwg-bar
    ./transmission.nix
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
