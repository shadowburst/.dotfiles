{ inputs, ... }:
{
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
