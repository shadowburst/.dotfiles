{ config, inputs, pkgs, ... }:

{
  stylix = {
    polarity = "dark";
    targets = {
      fzf.enable = false;
      gtk.extraCss = ''
        .window-frame { box-shadow: none; margin: 0; }
      '';
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
    platformTheme.name = "gtk";
    style = {
      name = "Catppuccin-Macchiato-Blue";
      package = pkgs.catppuccin-kvantum.override {
        accent = "Blue";
        variant = "Macchiato";
      };
    };
  };
}
