{pkgs, ...}: {
  xdg.configFile."quickshell".source = pkgs.fetchFromGitHub {
    owner = "caelestia-dots";
    repo = "shell";
    rev = "main";
    hash = "sha256-PxL0Su767Kuz/S2LQqop8f7PiwHHiQqT5zXKMHqfN9A=";
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
