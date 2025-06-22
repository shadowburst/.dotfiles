{pkgs, ...}: {
  stylix = {
    autoEnable = false;
    polarity = "dark";
    iconTheme = {
      enable = true;
      package = pkgs.kora-icon-theme;
      dark = "kora";
    };
    targets = {
      gtk = {
        enable = true;
        extraCss = ''
          .window-frame { box-shadow: none; margin: 0; }
        '';
      };
      hyprland.enable = true;
    };
  };
}
