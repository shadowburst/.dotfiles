{...}: {
  services.desktopManager.cosmic.enable = true;
  services.displayManager.cosmic-greeter.enable = true;
  security.pam.services.cosmic-greeter = {
    enableGnomeKeyring = true;
    gnupg.enable = true;
  };
}
