{pkgs, ...}: {
  stylix = {
    enableReleaseChecks = false;
    autoEnable = false;
    polarity = "dark";
    icons = {
      enable = true;
      package = pkgs.tela-circle-icon-theme;
      dark = "Tela-circle-dark";
    };
    targets = {
      gtk.enable = true;
      hyprland.enable = true;
      qt = {
        enable = true;
        standardDialogs = "xdgdesktopportal";
      };
    };
  };
}
