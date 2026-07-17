{ inputs, ... }:
{
  flake.nixosModules.cli = {
    nix.settings.extra-substituters = [ "https://cache.numtide.com" ];
    nix.settings.extra-trusted-public-keys = [
      "niks3.numtide.com-1:DTx8wZduET09hRmMtKdQDxNNthLQETkc/yaX7M4qK0g="
    ];
  };

  flake.homeModules.cli =
    { config, pkgs, ... }:
    let
      dotfilesDir = "${config.home.homeDirectory}/.dotfiles";

      mkOmpConfigSymlink = path: {
        source = config.lib.file.mkOutOfStoreSymlink "${dotfilesDir}/${path}";
      };
    in
    {
      home.packages = [
        inputs.llm-agents.packages.${pkgs.stdenv.hostPlatform.system}.omp
      ];

      home.file.".omp/agent/config.yml" = mkOmpConfigSymlink "config/omp/config.yml";
    };
}
