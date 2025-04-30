{
  config,
  pkgs,
  ...
}: {
  home.packages = with pkgs; [hyprpanel];

  xdg.configFile."hyprpanel".source =
    config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/home-modules/desktop/ags/hyprpanel";
}
