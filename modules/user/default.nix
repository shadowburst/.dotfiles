{ stateVersion, username, ... }:

{
  programs.home-manager.enable = true;

  home = {
    inherit stateVersion;

    username = "${username}";
    homeDirectory = "/home/${username}";
  };

  xdg.enable = true;

  imports = [
    ./desktop
    ./terminal
    ./theme
  ];
}
