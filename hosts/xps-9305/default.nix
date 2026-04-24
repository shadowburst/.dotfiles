{ inputs, self, ... }:
{
  systems = [ "x86_64-linux" ];

  flake.nixosConfigurations.xps-9305 = inputs.nixpkgs.lib.nixosSystem {
    modules = [
      self.nixosModules.xps-9305-configuration
      self.nixosModules.core
      self.nixosModules.shared
      self.nixosModules.terminal
      self.nixosModules.desktop
      self.nixosModules.work

      inputs.home-manager.nixosModules.home-manager
      {
        home-manager.useGlobalPkgs = true;
        home-manager.useUserPackages = true;
        home-manager.users.pbaudry.imports = [
          self.homeModules.xps-9305
          self.homeModules.core
          self.homeModules.shared
          self.homeModules.terminal
          self.homeModules.desktop
          self.homeModules.work
        ];
      }
    ];
  };
}
