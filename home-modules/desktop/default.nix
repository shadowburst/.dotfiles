{pkgs, ...}: {
  imports = [
    ./brave.nix
    # ./cosmic
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
    simple-scan
    video-downloader
  ];

  home.file."Pictures/Wallpapers" = {
    source = ./wallpapers;
    recursive = true;
  };
}
