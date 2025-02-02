{pkgs, ...}: {
  stylix = {
    autoEnable = false;
    polarity = "dark";
    targets = {
      gtk = {
        enable = true;
        extraCss = ''
          .window-frame { box-shadow: none; margin: 0; }
        '';
      };
      hyprland = {
        enable = true;
        hyprpaper.enable = true;
      };
    };
  };

  gtk = {
    iconTheme = {
      name = "kora";
      package = pkgs.kora-icon-theme;
    };
  };
}
