{
  stateVersion,
  username,
  ...
}: {
  imports = [
    ./catppuccin.nix
    ./stylix.nix
  ];

  programs.home-manager.enable = true;

  xdg.enable = true;

  home = {
    inherit stateVersion username;

    homeDirectory = "/home/${username}";
  };
}
