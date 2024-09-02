{ config, inputs, pkgs, ... }:

{
  imports = [ inputs.stylix.nixosModules.stylix ];

  stylix = {
    enable = true;
    
    image = ./wallpapers/current.jpg;
    
    fonts = {
      sansSerif = {
        name = "Noto Sans";
        package = pkgs.noto-fonts;
      };
      serif = config.stylix.fonts.sansSerif;
      monospace = {
        name = "JetBrainsMono Nerd Font";
        package = with pkgs; (nerdfonts.override {
          fonts = [ "JetBrainsMono" ];
        });
      };
      emoji = {
        name = "Noto Color Emoji";
        package = pkgs.noto-fonts-emoji;
      };
    };

    cursor = {
      name = "Bibata-Modern-Classic";
      package = pkgs.bibata-cursors;
      size = 24;
    };

    base16Scheme = "${pkgs.base16-schemes}/share/themes/catppuccin-macchiato.yaml";
    targets = {
      plymouth.enable = false;
    };
  };

  boot.plymouth = {
    enable = true;
    theme = "catppuccin-macchiato";
    themePackages = with pkgs; [ catppuccin-plymouth ];
  };
  
  qt = {
    enable = true;
    platformTheme = "qt5ct";
    style = "kvantum";
  };
}
