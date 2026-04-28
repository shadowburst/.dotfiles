{ self, ... }:
{
  flake.nixosModules.podman =
    { pkgs, ... }:
    {
      virtualisation.podman = {
        enable = true;
        dockerCompat = false;
        defaultNetwork.settings.dns_enabled = true;
      };

      virtualisation.containers.containersConf.settings.engine.runtime = "crun";

      users.users.${self.username}.linger = true;
    };
}
