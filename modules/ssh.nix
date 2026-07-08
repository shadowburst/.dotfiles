_: {
  flake.nixosModules.cli =
    { lib, pkgs, ... }:
    {
      services.openssh = {
        enable = true;
        allowSFTP = true;
        openFirewall = false;
      };
      services.gnome.gcr-ssh-agent.enable = true;
    };
}
