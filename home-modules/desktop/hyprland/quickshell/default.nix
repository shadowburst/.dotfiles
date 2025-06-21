{pkgs, ...}: {
  xdg.configFile."quickshell".source = pkgs.fetchFromGitHub {
    owner = "caelestia-dots";
    repo = "shell";
    rev = "main";
    sha256 = "04qg9kk9vkrrvw03vfqwxbpbayf6w6lglhq4c12snijllds2iddk";
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

  xdg.stateFile."caelestia/wallpaper/path.txt".text = builtins.toString ./wallpapers/12.jpg;

  home.packages = with pkgs; [
    app2unit
    libqalculate
    material-symbols
  ];

  home.file."Pictures/Wallpapers" = {
    source = ./wallpapers;
    recursive = true;
  };
}
