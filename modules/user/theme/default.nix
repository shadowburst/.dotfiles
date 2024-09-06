{ lib, pkgs, ... }:

let
  catppuccinKvantum = pkgs.catppuccin-kvantum.override {
    accent = "Blue";
    variant = "Macchiato";
  };
in
{
  stylix = {
    polarity = "dark";
    targets = {
      fzf.enable = false;
      gtk.extraCss = ''
        .window-frame { box-shadow: none; margin: 0; }
      '';
      fish.enable = false;
      kitty.enable = false;
      tmux.enable = false;
      yazi.enable = false;
    };
  };

  gtk = {
    iconTheme = {
      name = "kora";
      package = pkgs.kora-icon-theme;
    };
  };

  qt = {
    enable = true;
    platformTheme.name = "qtct";
    style.name = "kvantum";
  };

  xdg.configFile."Kvantum/kvantum.kvconfig".text = lib.generators.toINI { } {
    General.theme = "Catppuccin-Macchiato-Blue";
  };
  xdg.configFile."Kvantum/Catppuccin-Macchiato-Blue".source = "${catppuccinKvantum}/share/Kvantum/Catppuccin-Macchiato-Blue";
  xdg.configFile."qt5ct/qt5ct.conf".text = lib.generators.toINI { } {
    Appearance.icon_theme = "Kora";
  };
  xdg.configFile."qt6ct/qt6ct.conf".text = lib.generators.toINI { } {
    Appearance.icon_theme = "Kora";
  };
}
