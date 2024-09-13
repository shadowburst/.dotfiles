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
    ./yazi
    ./zoxide
  ];

  home.packages = with pkgs; [
    curl
    fd
    gcc
    gnumake
    htop
    jq
    ripgrep
    sshfs
    tldr
    trash-cli
    tree
    wget
    unzip
    xdg-utils
  ];
}
