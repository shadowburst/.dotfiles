{config, ...}: {
  xdg.configFile."DankMaterialShell".source =
    config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/home-modules/desktop/dms/config";
}
