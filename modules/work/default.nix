{ self, ... }:
{
  flake.nixosModules.work =
    { lib, pkgs, ... }:
    {
      imports = [
        self.nixosModules.traefik
      ];
    };

  flake.homeModules.work =
    { lib, pkgs, ... }:
    {
      home.packages = with pkgs; [
        stripe-cli
        tableplus
      ];
    };
}
