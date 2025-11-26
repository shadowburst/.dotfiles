{pkgs, ...}: {
  imports = [
    ./brave.nix
    ./ghostty
    ./hypr
    ./mpv.nix
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
    video-downloader
  ];

  home.file."Pictures/Wallpapers" = {
    source = ./wallpapers;
    recursive = true;
  };
}
