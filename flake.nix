{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    vue-ls-nixpkgs.url = "github:nixos/nixpkgs/3a7affa77a5a539afa1c7859e2c31abdb1aeadf3";

    home-manager.url = "github:nix-community/home-manager";
    home-manager.inputs.nixpkgs.follows = "nixpkgs";

    nixos-hardware.url = "github:NixOS/nixos-hardware/master";

    stylix.url = "github:nix-community/stylix";
    stylix.inputs.nixpkgs.follows = "nixpkgs";

    catppuccin.url = "github:catppuccin/nix";

    nix-index-database.url = "github:nix-community/nix-index-database";
    nix-index-database.inputs.nixpkgs.follows = "nixpkgs";

    noctalia.url = "github:noctalia-dev/noctalia-shell";
    noctalia.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = {nixpkgs, ...} @ inputs: let
    hosts = [
      "xps-9305"
      "zephyrus"
    ];
    stateVersion = "26.05";
    username = "pbaudry";
  in {
    nixosConfigurations = builtins.listToAttrs (
      builtins.map (host: {
        name = host;
        value = nixpkgs.lib.nixosSystem {
          specialArgs = {
            inherit
              host
              inputs
              stateVersion
              username
              ;
          };
          modules = with inputs; [
            ./hosts/${host}/configuration.nix

            home-manager.nixosModules.home-manager
            {
              home-manager.useGlobalPkgs = true;
              home-manager.useUserPackages = true;
              home-manager.extraSpecialArgs = {
                inherit
                  host
                  inputs
                  stateVersion
                  username
                  ;
              };
              home-manager.users.${username} = {
                imports = [./hosts/${host}/home];
              };
            }
          ];
        };
      })
      hosts
    );
  };
}
