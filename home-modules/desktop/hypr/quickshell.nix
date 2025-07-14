{
  pkgs,
  username,
  ...
}: {
  xdg.configFile."quickshell".source = pkgs.fetchFromGitHub {
    owner = "shadowburst";
    repo = "shell";
    rev = "178a63602530f44169ea740e4e1530a9a14212ea";
    sha256 = "1m6czaazkdw0a42gpdkgiysh3g4iacc0fdjhli4dhxy55x5w4wql";
  };
  xdg.configFile."caelestia/shell.json".text = builtins.toJSON {
    bar = {
      persistent = false;
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

  xdg.stateFile."caelestia/wallpaper/path.txt".text = "/home/${username}/.dotfiles/home-modules/desktop/wallpapers/12.jpg";

  home.packages = with pkgs; [
    app2unit
    libqalculate
    lm_sensors
    inotify-tools
    material-symbols
  ];
}
