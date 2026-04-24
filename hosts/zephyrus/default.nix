{ inputs, self, ... }:
{
  systems = [ "x86_64-linux" ];

  flake.nixosConfigurations.zephyrus = inputs.nixpkgs.lib.nixosSystem {
    modules = [
      self.nixosModules.zephyrus-configuration
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
          self.homeModules.zephyrus
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
