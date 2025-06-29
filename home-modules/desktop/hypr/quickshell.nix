{pkgs, ...}: {
  xdg.configFile."quickshell".source = pkgs.fetchFromGitHub {
    owner = "caelestia-dots";
    repo = "shell";
    rev = "0d7804f67723107f4e78beca8229d2fbb82ce4a3";
    sha256 = "1r1hny5jbaqiqb4n7210v9s6rd4wz52c99y6n26rbid56d2ndj68";
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
