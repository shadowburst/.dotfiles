{pkgs, ...}: {
  imports = [
    ./bat.nix
    ./cava.nix
    ./comma.nix
    ./eza.nix
    ./fzf.nix
    ./git.nix
    ./lazydocker
    ./nvim
    ./shell.nix
    ./starship.nix
    ./tmux
    ./yazi
    ./zoxide.nix
  ];

  home.packages = with pkgs; [
    act
    curl
    delta
    fd
    ffmpeg
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
