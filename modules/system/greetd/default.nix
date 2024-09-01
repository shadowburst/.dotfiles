{ config, pkgs, ... }:

{
  programs.regreet = { 
    enable = true;
    cursorTheme.name = config.stylix.cursor.name;
    font.name = config.stylix.fonts.sansSerif.name;
    iconTheme = {
      name = "kora";
      package = pkgs.kora-icon-theme;
    };
    theme = {
      name = "catppuccin-macchiato-blue-standard";
      package = pkgs.catppuccin-gtk.override {
        accents = [ "blue" ];
        variant = "macchiato";
      };
    };
    settings = {
      background = {
        path = ../theme/wallpapers/current.jpg;
        fit = "Cover";
      };
    };
  };
}
