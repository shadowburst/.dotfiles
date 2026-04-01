{ inputs, ... }:
{
  flake.nixosModules.stylix =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    {
      imports = [ inputs.stylix.nixosModules.stylix ];

      fonts.packages = with pkgs; [ nerd-fonts.caskaydia-cove ];

      stylix = {
        enable = true;
        enableReleaseChecks = false;
        autoEnable = false;
        polarity = "dark";

        fonts = {
          sansSerif.name = "Rubik Regular";
          sansSerif.package = pkgs.rubik;

          serif = config.stylix.fonts.sansSerif;

          monospace.name = "CaskaydiaCove Nerd Font";
          monospace.package = pkgs.nerd-fonts.caskaydia-cove;

          emoji.name = "Noto Color Emoji";
          emoji.package = pkgs.noto-fonts-emoji;
        };

        cursor.name = "Bibata-Modern-Classic";
        cursor.package = pkgs.bibata-cursors;
        cursor.size = 24;

        base16Scheme = "${pkgs.base16-schemes}/share/themes/catppuccin-mocha.yaml";

        targets.console.enable = true;
      };
    };

  flake.homeModules.stylix =
    { lib, pkgs, ... }:
    {
      stylix = {
        enableReleaseChecks = false;
        autoEnable = false;
        polarity = "dark";
        icons = {
          enable = true;
          package = pkgs.tela-circle-icon-theme;
          dark = "Tela-circle-dark";
        };

        targets.gtk.enable = true;
        targets.hyprland.enable = true;
        targets.qt = {
          enable = true;
          standardDialogs = "xdgdesktopportal";
        };
      };
    };
}
