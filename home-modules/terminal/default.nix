{ pkgs, ... }:
{
  imports = [
    ./bash.nix
    ./btop.nix
    ./comma.nix
    ./eza.nix
    ./fish.nix
    ./fzf.nix
    ./git.nix
    ./lazydocker.nix
    ./nushell.nix
    ./nvim
    ./opencode.nix
    ./starship.nix
    ./television
    ./tmux
    ./worktrunk.nix
    ./yazi.nix
    ./zoxide.nix
  ];

  programs.bat.enable = true;
  programs.carapace.enable = true;
  programs.cava.enable = true;
  programs.direnv.enable = true;

  home.packages = with pkgs; [
    act
    curl
    devbox
    fd
    ffmpeg
    gcc
    gnumake
    jq
    ripgrep
    sqlit-tui
    sshfs
    tldr
    trash-cli
    tree
    wget
    unzip
    xdg-utils
  ];
}
