{pkgs, ...}: {
  xdg.configFile."quickshell".source = pkgs.fetchFromGitHub {
    owner = "shadowburst";
    repo = "shell";
    rev = "8af10012b9527e3e4a894e4a3c0fd8ea9ac0e132";
    sha256 = "1r5wjkfin6z0ir3fjd2g2824fcvkhz8jg0655va2rbvj7c57wb63";
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
