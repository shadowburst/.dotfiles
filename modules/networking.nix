{ self, ... }:
{
  flake.nixosModules.nas =
    { config, lib, ... }:
    {
      # Only Tailscale's encrypted transport is exposed outside the tailnet.
      networking.firewall = {
        allowedTCPPorts = lib.mkForce [ ];
        allowedUDPPorts = lib.mkForce [ config.services.tailscale.port ];
      };
    };

  flake.nixosModules.core =
    { lib, pkgs, ... }:
    {
      users.users.${self.username}.extraGroups = [ "networkmanager" ];

      networking.firewall = {
        enable = true;
        allowedUDPPorts = [
          # Casting
          8008
          8009
        ];
        checkReversePath = "loose"; # Needed for wireguard VPNs
      };
      networking.networkmanager.enable = true;

      services.avahi = {
        enable = true;
        nssmdns4 = true;
        settings.publish = {
          disable-publishing = false;
          publish-addresses = true;
          disable-user-service-publishing = false;
        };
      };

      # The "+" prefix lets cleanup bypass Avahi's capability limits to remove its stale PID file.
      systemd.services.avahi-daemon.serviceConfig = {
        ExecStartPre = [ "+${pkgs.coreutils}/bin/rm -f /run/avahi-daemon/pid" ];
        ReadWritePaths = [ "/run/avahi-daemon" ];
      };
    };
}
