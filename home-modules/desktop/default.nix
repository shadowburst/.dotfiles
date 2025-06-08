{pkgs, ...}: {
  imports = [
    ./brave.nix
    ./cosmic
    ./kitty.nix
    ./mpv.nix
    ./transmission.nix
  ];

  home.packages = with pkgs; [
    discord
    ente-auth
    gimp3
    pdfarranger
    simple-scan
    video-downloader
  ];
}
