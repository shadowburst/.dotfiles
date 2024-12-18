{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";

    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    nixos-hardware.url = "github:NixOS/nixos-hardware/master";

    stylix = {
      url = "github:danth/stylix";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    ags = {
      url = "github:Aylur/ags/v1";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    hyprpanel = {
      url = "github:Jas-SinghFSU/HyprPanel";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    hyprland.url = "github:hyprwm/Hyprland";
    hypr-dynamic-cursors = {
      url = "github:VirtCode/hypr-dynamic-cursors";
      inputs.hyprland.follows = "hyprland";
    };

    catppuccin.url = "github:catppuccin/nix";
  };

  outputs =
    { nixpkgs, ... }@inputs:
    let
      hosts = [
        "xps-9310"
        "xps-9305"
      ];
      stateVersion = "24.05";
      username = "pbaudry";
    in
    {
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
              {
                nixpkgs.overlays = [
                  inputs.hyprpanel.overlay
                ];
              }
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
                  imports = [ ./hosts/${host}/home ];
                };
              }
            ];
          };
        }) hosts
      );
    };
}
