{ ... }:
{
  flake.nixosModules.traefik =
    { lib, pkgs, ... }:
    {
      users.users.traefik.extraGroups = [ "docker" ];

      services.traefik = {
        enable = true;

        staticConfigOptions = {
          api = {
            insecure = true;
          };
          providers.docker = {
            exposedByDefault = true;
          };
          entryPoints = {
            web.address = ":80";
            traefik.address = ":8080";
          };
        };
      };

      networking.firewall.allowedTCPPorts = [
        80
        8080
      ];
    };
}
