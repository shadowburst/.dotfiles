{pkgs, ...}: {
  services.greetd = {
    enable = true;
    settings.default_session.command = "${pkgs.tuigreet}/bin/tuigreet --time --time-format '%A %e, %B %Y' --remember --asterisks --cmd 'uwsm start default'";
  };

  security.pam.services.greetd.enableGnomeKeyring = true;

  programs.hyprland = {
    enable = true;
    withUWSM = true;
  };
}
