{ self, ... }:
{
  flake.nixosModules.desktop =
    { ... }:
    {
      imports = [
        self.nixosModules.hypr
        self.nixosModules.noctalia
        self.nixosModules.pipewire
        self.nixosModules.printers
        self.nixosModules.steam
      ];

      programs.gnome-disks.enable = true;
    };

  flake.homeModules.desktop =
    { pkgs, ... }:
    {
      imports = [
        self.homeModules.ghostty
        self.homeModules.hypr
        self.homeModules.images
        self.homeModules.kitty
        self.homeModules.mpv
        self.homeModules.noctalia
        self.homeModules.paseo
        self.homeModules.transmission
        self.homeModules.voxtype
      ];

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

      programs.brave.enable = true;

      home.sessionVariables.BROWSER = "brave";
      home.sessionVariables.TERMINAL = "kitty";
    };
}
