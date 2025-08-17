{config, ...}: {
  programs.caelestia = {
    enable = true;
    cli.enable = true;
    settings = {
      general.apps.terminal = config.home.sessionVariables.TERMINAL;
      appearance = {
        font = {
          sans = config.stylix.fonts.sansSerif.name;
          mono = config.stylix.fonts.monospace.name;
        };
      };
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
      services.smartScheme = false;
      services.weatherLocation = "48.306453773398786, -0.6214670156648004";
      session.vimKeybinds = true;
      paths.sessionGif = ./assets/eye.png;
    };
  };
}
