{username, ...}: {
  users.users.${username}.extraGroups = ["networkmanager"];

  networking = {
    firewall = {
      enable = true;
      allowedUDPPorts = [
        # Casting
        8008
        8009
      ];
      checkReversePath = "loose"; # Needed for wireguard VPNs
    };
    networkmanager.enable = true;
  };

  services.avahi = {
    enable = true;
    nssmdns4 = true;
    publish = {
      enable = true;
      addresses = true;
      userServices = true;
    };
  };
}
