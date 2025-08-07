{
  config,
  inputs,
  pkgs,
  ...
}: {
  home.packages = [
    inputs.caelestia-cli.packages.${pkgs.system}.default
  ];
  xdg.configFile."caelestia/shell.json".text = builtins.toJSON {
    general.apps.terminal = config.home.sessionVariables.TERMINAL;
    bar = {
      status.showAudio = true;
      workspaces = {
        shown = 7;
        occupiedBg = true;
        activeTrail = true;
        occupiedLabel = " ";
        activeLabel = " ";
      };
    };
    border = {
      thickness = 1;
      rounding = 12;
    };
    launcher.vimKeybinds = true;
    services.weatherLocation = "48.306453773398786, -0.6214670156648004";
    session.vimKeybinds = true;
  };
  xdg.stateFile."caelestia/wallpaper/path.txt".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/home-modules/desktop/hypr/caelestia/state/wallpaper.txt";
  xdg.stateFile."caelestia/scheme.json".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/home-modules/desktop/hypr/caelestia/state/scheme.json";
}
