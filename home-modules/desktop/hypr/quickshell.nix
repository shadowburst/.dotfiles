{pkgs, ...}: {
  xdg.configFile."quickshell".source = pkgs.fetchFromGitHub {
    owner = "shadowburst";
    repo = "shell";
    rev = "18b6a321deb83a28ce1d86395e6de8603fb46375";
    sha256 = "0h5lhgqmgv4p6v15mnmsx6z9akkj8wgkmzxqmv9w1c928hfb0c4c";
  };
  xdg.configFile."caelestia/shell.json".text = builtins.toJSON {
    bar = {
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
    dashboard = {
      weatherLocation = "48.306453773398786, -0.6214670156648004";
    };
  };

  xdg.stateFile."caelestia/wallpaper/path.txt".text = builtins.toString ../wallpapers/12.jpg;

  home.packages = with pkgs; [
    app2unit
    libqalculate
    lm_sensors
    inotify-tools
    material-symbols
  ];
}
