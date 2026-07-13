_: {
  flake.nixosModules.gui =
    { ... }:
    {
      programs.gnome-disks.enable = true;
    };

  flake.homeModules.gui =
    { pkgs, ... }:
    {
      home.packages = with pkgs; [
        devtoolbox
        discord
        ente-auth
        gimp3
        papers
        pdfarranger
        proton-vpn
        simple-scan
        video-downloader
      ];

      home.sessionVariables.TERMINAL = "kitty";

      home.pointerCursor.enable = true;
    };
}
