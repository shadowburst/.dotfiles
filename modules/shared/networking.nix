{ self, ... }:
{
  flake.nixosModules.networking =
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
        publish = {
          enable = true;
          addresses = true;
          userServices = true;
        };
      };

      # Avahi fails to start when a stale PID file is left over after a restart
      # (e.g. during nixos-rebuild switch). It detects the old process is gone and
      # attempts unlink(), but then fails to open the PID file with O_CREAT|O_EXCL.
      # Forcibly removing the PID file before start (as root, before privilege drop)
      # guarantees a clean slate. The "-" prefix silently ignores a missing file.
      systemd.services.avahi-daemon.serviceConfig = {
        ExecStartPre = [ "-${pkgs.coreutils}/bin/rm -f /run/avahi-daemon/pid" ];
        ReadWritePaths = [ "/run/avahi-daemon" ];
      };
    };
}
