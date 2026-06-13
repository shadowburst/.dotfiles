{ inputs, self, ... }:
{
  systems = [ "x86_64-linux" ];

  flake.nixosConfigurations.xps-9305 = inputs.nixpkgs.lib.nixosSystem {
    modules = [
      self.nixosModules.core
      self.nixosModules.cli
      self.nixosModules.gui
      self.nixosModules.gaming
      self.nixosModules.laravel
      self.nixosModules.xps-9305

      inputs.home-manager.nixosModules.home-manager
      {
        home-manager.useGlobalPkgs = true;
        home-manager.useUserPackages = true;
        home-manager.users.pbaudry.imports = [
          self.homeModules.core
          self.homeModules.cli
          self.homeModules.gui
          self.homeModules.laravel
          self.homeModules.xps-9305
        ];
      }
    ];
  };
}
