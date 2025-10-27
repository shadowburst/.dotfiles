{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";

    home-manager.url = "github:nix-community/home-manager";
    home-manager.inputs.nixpkgs.follows = "nixpkgs";

    nixos-hardware.url = "github:NixOS/nixos-hardware/master";

    stylix.url = "github:danth/stylix";
    stylix.inputs.nixpkgs.follows = "nixpkgs";

    catppuccin.url = "github:catppuccin/nix";

    nix-index-database.url = "github:nix-community/nix-index-database";
    nix-index-database.inputs.nixpkgs.follows = "nixpkgs";

    caelestia-shell.url = "github:caelestia-dots/shell";
    caelestia-shell.inputs.nixpkgs.follows = "nixpkgs";

    hyprland.url = "github:hyprwm/Hyprland";
    hyprland-plugins.url = "github:hyprwm/hyprland-plugins";
    hyprland-plugins.inputs.hyprland.follows = "hyprland";
    hypr-dynamic-cursors.url = "github:VirtCode/hypr-dynamic-cursors";
    hypr-dynamic-cursors.inputs.hyprland.follows = "hyprland";
  };

  outputs = {nixpkgs, ...} @ inputs: let
    hosts = [
      "xps-9305"
      "zephyrus"
    ];
    stateVersion = "24.05";
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
