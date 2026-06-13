{ inputs, self, ... }:
{
  systems = [ "x86_64-linux" ];

  flake.nixosConfigurations.lenovo-p14s = inputs.nixpkgs.lib.nixosSystem {
    modules = [
      self.nixosModules.core
      self.nixosModules.cli
      self.nixosModules.gui
      self.nixosModules.laravel
      self.nixosModules.lenovo-p14s

      inputs.home-manager.nixosModules.home-manager
      {
        home-manager.useGlobalPkgs = true;
        home-manager.useUserPackages = true;
        home-manager.users.pbaudry.imports = [
          self.homeModules.core
          self.homeModules.cli
          self.homeModules.gui
          self.homeModules.laravel
          self.homeModules.lenovo-p14s
        ];
      }
    ];
  };
}
