{config, ...}: {
  programs.caelestia = {
    enable = true;
    cli.enable = true;
    settings = {
      appearance.font.sans = config.stylix.fonts.sansSerif.name;
      appearance.font.mono = config.stylix.fonts.monospace.name;
      # background.visualiser.autoHide = false;
      bar.clock.showIcon = false;
      bar.status.showAudio = true;
      bar.workspaces.shown = 7;
      bar.workspaces.occupiedBg = true;
      bar.workspaces.activeTrail = true;
      bar.workspaces.occupiedLabel = " ";
      bar.workspaces.activeLabel = " ";
      bar.entries = [
        {
          id = "logo";
          enabled = true;
        }
        {
          id = "workspaces";
          enabled = true;
        }
        {
          id = "spacer";
          enabled = true;
        }
        {
          id = "activeWindow";
          enabled = true;
        }
        {
          id = "spacer";
          enabled = true;
        }
        {
          id = "tray";
          enabled = true;
        }
        {
          id = "idleInhibitor";
          enabled = true;
        }
        {
          id = "statusIcons";
          enabled = true;
        }
        {
          id = "clock";
          enabled = true;
        }
      ];
      border.thickness = 1;
      border.rounding = 12;
      dashboard.showOnHover = false;
      general.apps.terminal = config.home.sessionVariables.TERMINAL;
      launcher.vimKeybinds = true;
      launcher.actionPrefix = "$";
      services.smartScheme = false;
      services.weatherLocation = "48.306453773398786, -0.6214670156648004";
      session.vimKeybinds = true;
      paths.sessionGif = ./assets/eye.png;
    };
  };
}
