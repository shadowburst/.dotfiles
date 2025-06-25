{pkgs, ...}: {
  xdg.configFile."quickshell".source = pkgs.fetchFromGitHub {
    owner = "shadowburst";
    repo = "shell";
    rev = "f9e4e79413362ba2cf79a0db1f6a5f72fb9fa220";
    sha256 = "1gafgqid2rbch3qz8gh1vmryr068zlmrczqpph927iprn8zlzy88";
  };
  xdg.configFile."caelestia/shell.json".text = builtins.toJSON {
    bar = {
      workspaces = {
        shown = 7;
        occupiedBg = true;
        activeTrail = true;
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
