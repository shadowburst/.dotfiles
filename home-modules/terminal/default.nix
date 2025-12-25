{pkgs, ...}: {
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
    ./opencode
    ./starship.nix
    ./tmux
    ./yazi.nix
    ./zoxide.nix
  ];

  programs = {
    bat.enable = true;
    carapace.enable = true;
    cava.enable = true;
  };

  home.packages = with pkgs; [
    act
    curl
    delta
    fd
    ffmpeg
    gcc
    gnumake
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
