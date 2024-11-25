{ lib, pkgs, ... }:

let
  catppuccinKvantum = pkgs.catppuccin-kvantum.override {
    accent = "blue";
    variant = "macchiato";
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

  xdg.configFile = {
    "Kvantum/kvantum.kvconfig".text = lib.generators.toINI { } {
      General.theme = "Catppuccin-Macchiato-Blue";
    };
    "Kvantum/Catppuccin-Macchiato-Blue".source = "${catppuccinKvantum}/share/Kvantum/Catppuccin-Macchiato-Blue";
    "qt5ct/qt5ct.conf".text = lib.generators.toINI { } {
      Appearance.icon_theme = "Kora";
    };
    "qt6ct/qt6ct.conf".text = lib.generators.toINI { } {
      Appearance.icon_theme = "Kora";
    };
  };
}
