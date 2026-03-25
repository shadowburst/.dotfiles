{ config, ... }:
{
  programs.television.enable = true;

  xdg.configFile = {
    "television/cable" = {
      source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/home-modules/terminal/television/config/cable";
      recursive = true;
    };
  };
}
