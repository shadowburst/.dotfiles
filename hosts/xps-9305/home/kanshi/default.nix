{
  services.kanshi = {
    enable = true;
    systemdTarget = "graphical-session.target";
    settings = [
      {
        profile = {
          name = "mobile";
          outputs = [
            {
              criteria = "eDP-1";
              mode = "3840x2160@59.997Hz";
              scale = 2.0;
            }
          ];
        };
      }
      {
        profile = {
          name = "docked";
          outputs = [
            {
              criteria = "eDP-1";
              mode = "3840x2160@59.997Hz";
              scale = 2.0;
              position = "0,120";
            }
            {
              criteria = "DP-1";
              mode = "3440x1440@59.999Hz";
              position = "1920,0";
              scale = 1.0;
              adaptiveSync = true;
            }
          ];
        };
      }
    ];
  };
}
