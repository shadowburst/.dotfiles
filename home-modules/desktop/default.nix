{pkgs, ...}: {
  imports = [
    ./brave.nix
    ./ghostty
    ./hypr
    ./mpv.nix
    ./options.nix
    ./stylix.nix
    ./transmission.nix
  ];

  home.packages = with pkgs; [
    devtoolbox
    discord
    ente-auth
    gimp3
    pdfarranger
    protonvpn-gui
    simple-scan
    tableplus
    video-downloader
  ];

  home.file."Pictures/Wallpapers" = {
    source = ./wallpapers;
    recursive = true;
  };
}
