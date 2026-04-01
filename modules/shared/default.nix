{ self, ... }:
{
  flake.nixosModules.shared =
    { lib, pkgs, ... }:
    {
      imports = [
        self.nixosModules.catppuccin
        self.nixosModules.docker
        self.nixosModules.kanata
        self.nixosModules.networking
        self.nixosModules.power
        self.nixosModules.stylix
        self.nixosModules.user
      ];
    };

  flake.homeModules.shared =
    { lib, pkgs, ... }:
    {
      imports = [
        self.homeModules.catppuccin
        self.homeModules.stylix
        self.homeModules.user
      ];
    };
}
