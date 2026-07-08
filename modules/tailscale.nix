_: {
  flake.nixosModules.core = {
    services.tailscale = {
      enable = true;
      openFirewall = true;
    };

    networking.firewall.interfaces.tailscale0.allowedTCPPorts = [ 22 ];
  };
}
