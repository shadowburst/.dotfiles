_: {
  flake.homeModules.cli =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    {
      programs.television.enable = true;

      xdg.configFile = {
        "television/cable" = {
          source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/config/television/cable";
          recursive = true;
        };
      };
    };
}
