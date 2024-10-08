{
  services.kanshi = {
    enable = true;
    settings = [
      {
        profile = {
          name = "mobile";
          outputs = [
            {
              criteria = "eDP-1";
              mode = "1920x1200@59.95Hz";
              scale = 1.0;
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
              mode = "1920x1200@59.95Hz";
              position = "0,120";
              scale = 1.0;
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
