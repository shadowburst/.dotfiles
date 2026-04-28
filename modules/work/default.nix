{ self, ... }:
{
  flake.nixosModules.work =
    { lib, pkgs, ... }:
    {
      imports = [
        self.nixosModules.podman
      ];
    };

  flake.homeModules.work =
    { lib, pkgs, ... }:
    {
      imports = [
        self.homeModules.lerd
      ];

      home.packages = with pkgs; [
        stripe-cli
        tableplus
      ];
    };
}
