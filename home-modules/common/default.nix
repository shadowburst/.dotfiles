{ stateVersion, username, ... }:

{
  programs.home-manager.enable = true;

  home = {
    inherit stateVersion;

    username = "${username}";
    homeDirectory = "/home/${username}";
    file.".face".source = ./face.jpg;
  };

  xdg.enable = true;

  imports = [
    ./stylix.nix
  ];
}
