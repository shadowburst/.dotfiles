{pkgs, ...}: {
  imports = [
    ./brave.nix
    # ./cosmic
    ./ghostty
    ./hypr
    ./images
    ./mpv.nix
    ./options.nix
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
}
