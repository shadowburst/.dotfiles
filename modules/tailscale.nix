{ self, ... }:
{
  flake.nixosModules.core = {
    services.tailscale = {
      enable = true;
      openFirewall = true;
      extraSetFlags = [
        "--ssh"
        "--operator=${self.username}"
      ];
    };

    networking.firewall.interfaces.tailscale0.allowedTCPPorts = [ 22 ];
  };
}
