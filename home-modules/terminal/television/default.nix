{
  config,
  lib,
  pkgs,
  ...
}:
let
  sessionizer = pkgs.writeShellScriptBin "sessionizer" (lib.fileContents ./bin/sessionizer);
in
{
  home.packages = [
    sessionizer
  ];

  programs.television.enable = true;

  xdg.configFile = {
    "television/cable" = {
      source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/home-modules/terminal/television/config/cable";
      recursive = true;
    };
  };
}
