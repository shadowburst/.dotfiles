{pkgs, ...}: {
  imports = [
    ./carapace.nix
    ./comma.nix
    ./eza.nix
    ./fish.nix
    ./fzf.nix
    ./git.nix
    ./lazydocker
    ./nvim
    ./opencode
    ./starship.nix
    ./tmux
    ./yazi.nix
    ./zoxide.nix
  ];

  programs = {
    bash.enable = true;
    bat.enable = true;
    btop.enable = true;
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
