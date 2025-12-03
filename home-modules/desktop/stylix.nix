{pkgs, ...}: {
  stylix = {
    enableReleaseChecks = false;
    autoEnable = false;
    polarity = "dark";
    iconTheme = {
      enable = true;
      package = pkgs.tela-circle-icon-theme;
      dark = "Tela-circle-dark";
    };
    targets = {
      gtk.enable = true;
      hyprland.enable = true;
    };
  };
}
