{ config, pkgs, ... }:

{
  home.packages = with pkgs; [
    lazydocker
  ];

  xdg.configFile."lazydocker".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/modules/user/terminal/lazydocker/config";
}
