{ inputs, self, ... }:
{
  systems = [ "x86_64-linux" ];

  flake.nixosConfigurations.lenovo-p14 = inputs.nixpkgs.lib.nixosSystem {
    modules = [
      self.nixosModules.lenovo-p14-configuration
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
          self.homeModules.lenovo-p14
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
