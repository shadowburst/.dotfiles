{config, ...}: {
  services.cliphist.enable = true;
  programs.fuzzel.enable = true;

  programs.caelestia = {
    enable = true;
    cli.enable = true;
    settings = {
      appearance = {
        font.sans = config.stylix.fonts.sansSerif.name;
        font.mono = config.stylix.fonts.monospace.name;
      };
      # background.visualiser.enabled = true;
      background.visualiser.autoHide = false;
      bar = {
        clock.showIcon = false;
        status.showAudio = true;
        status.showLockStatus = false;
        status.showMicrophone = true;
        tray.compact = true;
        workspaces.shown = 7;
        workspaces.occupiedBg = true;
        workspaces.activeTrail = true;
        workspaces.occupiedLabel = " ";
        workspaces.activeLabel = " ";
        scrollActions.brightness = false;
        scrollActions.workspaces = false;
        scrollActions.volume = false;
        entries = [
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
            id = "statusIcons";
            enabled = true;
          }
          {
            id = "clock";
            enabled = true;
          }
        ];
      };
      border = {
        thickness = 1;
        rounding = 12;
      };
      dashboard.showOnHover = false;
      general = {
        apps.terminal = config.home.sessionVariables.TERMINAL;
        idle.timeouts = [];
      };
      launcher = {
        vimKeybinds = true;
        actionPrefix = ":";
      };
      services = {
        smartScheme = false;
        weatherLocation = "48.306453773398786, -0.6214670156648004";
      };
      session.vimKeybinds = true;
      paths.sessionGif = ./assets/eye.png;
    };
  };
}
