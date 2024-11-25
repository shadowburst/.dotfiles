{ pkgs, ... }:

{
  imports = [
    ./bash.nix
    ./bat.nix
    ./cava.nix
    ./eza.nix
    ./fish.nix
    ./fzf.nix
    ./git.nix
    ./lazydocker
    ./nvim
    ./starship.nix
    ./tmux
    ./yazi
    ./zoxide.nix
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
