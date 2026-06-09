{ inputs, ... }:
{
  flake.homeModules.omp =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    let
      dotfilesDir = "${config.home.homeDirectory}/.dotfiles";

      mkOmpConfigSymlink = path: {
        source = config.lib.file.mkOutOfStoreSymlink "${dotfilesDir}/${path}";
      };
    in
    {
      home.packages = with inputs.llm-agents.packages.${pkgs.stdenv.hostPlatform.system}; [
        omp
      ];

      home.file = {
        ".omp/agent/config.yml" = mkOmpConfigSymlink "config/omp/config.yml";
        ".omp/agent/themes" = mkOmpConfigSymlink "config/omp/themes";
      };
    };
}
