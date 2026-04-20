_:
{
  flake.homeModules.television =
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
          source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/modules/terminal/television/cable";
          recursive = true;
        };
      };
    };
}
