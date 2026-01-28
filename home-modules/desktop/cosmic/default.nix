{config, ...}: {
  xdg.configFile."cosmic".source =
    config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/home-modules/desktop/cosmic/config";
}
