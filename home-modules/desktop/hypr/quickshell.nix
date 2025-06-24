{pkgs, ...}: {
  xdg.configFile."quickshell".source = pkgs.fetchFromGitHub {
    owner = "caelestia-dots";
    repo = "shell";
    rev = "9c0223da60dac83fc8d0d9dc17b332882c986eb1";
    hash = "sha256-IcfLB39QeN8hsqrHZzcqxIn+kHWMS5d4mBybEnhpUvY=";
  };
  xdg.configFile."caelestia/shell.json".text = builtins.toJSON {
    bar = {
      workspaces = {
        shown = 7;
        showWindows = false;
        occupiedLabel = " ";
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
    notifs = {
      expire = true;
    };
  };

  xdg.stateFile."caelestia/wallpaper/path.txt".text = builtins.toString ../wallpapers/12.jpg;

  home.packages = with pkgs; [
    app2unit
    libqalculate
    material-symbols
  ];
}
