{ inputs, nixpkgs, ... }:

let
  stateVersion = "24.05";
  username = "pbaudry";
in {
  xps-9310 = let host = "xps-9310"; in nixpkgs.lib.nixosSystem {
    specialArgs = {
      inherit host inputs stateVersion username;
    };
    modules = with inputs; [
      ./${host}/configuration.nix
      ../modules/system

      home-manager.nixosModules.home-manager
      {
        home-manager.useGlobalPkgs = true;
        home-manager.useUserPackages = true;
        home-manager.extraSpecialArgs = {
          inherit host inputs stateVersion username;
        };
        home-manager.users.${username} = {
          imports = [ 
            ./${host}/home.nix
            ../modules/user
          ];
        };
      }
    ];
  };
}
