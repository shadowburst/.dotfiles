{pkgs, ...}: {
  xdg.configFile."quickshell".source = pkgs.fetchFromGitHub {
    owner = "shadowburst";
    repo = "shell";
    rev = "8a6679eace029338747f0fe95ca683016fce783e";
    sha256 = "0zsh3nj2ihm5h7chhjicj13b4h4i4458ml7nwl2cw17aqpdiklf8";
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
