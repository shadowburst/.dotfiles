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

  # Manage bash to include session variables in scripts
  programs.bash.enable = true;
  programs.bat.enable = true;
  programs.btop.enable = true;
  programs.cava.enable = true;

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
