{ stateVersion, username, ... }:

{
  programs.home-manager.enable = true;

  home = {
    inherit stateVersion;

    username = "${username}";
    homeDirectory = "/home/${username}";
    file.".face".source = ./avatar.jpg;
  };

  xdg.enable = true;

  imports = [
    ./theme.nix
  ];
}
