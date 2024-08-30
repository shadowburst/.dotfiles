{ pkgs, ... }:

{
  imports = [
    ./bash
    ./bat
    ./cava
    ./eza
    ./fish
    ./fzf
    ./git
    ./lazydocker
    ./nvim
    ./starship
    ./tmux
    ./transmission
    ./yazi
    ./zoxide
  ];

  home.packages = with pkgs; [
    brightnessctl
    curl
    fd
    gcc
    gnumake
    htop
    jq
    ripgrep
    sshfs
    trash-cli
    tree
    wget
    wl-clipboard
    unzip
    xdg-utils
  ];
}
