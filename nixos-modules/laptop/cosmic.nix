{...}: {
  services.desktopManager.cosmic.enable = true;
  services.displayManager.cosmic-greeter.enable = true;
  security.pam.services.cosmic-greeter = {
    enableGnomeKeyring = true;
    gnupg.enable = true;
  };
  environment.sessionVariables.NIXOS_OZONE_WL = "1";
}
