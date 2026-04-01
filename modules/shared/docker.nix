{ self, ... }:
{
  flake.nixosModules.docker =
    { lib, pkgs, ... }:
    {
      users.users.${self.username}.extraGroups = [ "docker" ];

      virtualisation.docker = {
        enable = true;
        autoPrune.enable = true;
      };
    };

  flake.homeModules.docker =
    { lib, pkgs, ... }:
    {
      programs.lazydocker = {
        enable = true;
        settings = {
          gui.returnImmediately = true;
        };
      };
    };
}
