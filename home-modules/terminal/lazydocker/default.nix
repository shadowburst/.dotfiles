{
  config,
  pkgs,
  ...
}: {
  home.packages = with pkgs; [lazydocker];

  xdg.configFile."lazydocker".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/home-modules/terminal/lazydocker/config";
}
