_: {
  flake.homeModules.gui =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    {
      home.file.".face".source =
        config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/config/images/face.jpg";

      home.file."Pictures/Wallpapers".source =
        config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/config/images/wallpapers";
    };
}
