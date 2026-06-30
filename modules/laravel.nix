{ self, ... }:
{
  flake.nixosModules.laravel =
    { ... }:
    {
      virtualisation.podman = {
        enable = true;
        dockerCompat = false;
        defaultNetwork.settings.dns_enabled = true;
      };

      virtualisation.containers.containersConf.settings.engine.runtime = "crun";

      users.users.${self.username}.linger = true;
    };

  flake.homeModules.laravel =
    { lib, pkgs, ... }:
    {
      home.packages = [
        pkgs.lerd
        pkgs.nssTools
        pkgs.stripe-cli
        pkgs.tableplus
      ];

      home.file.".local/bin/lerd".source = lib.getExe pkgs.lerd;
    };
}
