{ self, ... }:
{
  flake.nixosModules.nas =
    { pkgs, ... }:
    {
      services.nextcloud = {
        enable = true;
        package = pkgs.nextcloud35;
        hostName = "nas";
        home = "/srv/nextcloud";
        database.createLocally = true;
        configureRedis = true;
        maxUploadSize = "16G";
        config = {
          dbtype = "pgsql";
          adminuser = self.username;
          adminpassFile = "/etc/nas/nextcloud-admin-password";
        };
        settings = {
          trusted_domains = [ "nas.*.ts.net" ];
          default_phone_region = "FR";
          maintenance_window_start = 3;
        };
      };

      networking.firewall.interfaces.tailscale0.allowedTCPPorts = [ 80 ];
    };
}
