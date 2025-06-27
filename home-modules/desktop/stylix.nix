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
      gtk.enable = true;
      hyprland.enable = true;
    };
  };
}
