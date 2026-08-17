_: {
  flake.homeModules.gui =
    { ... }:
    {
      programs.brave-origin = {
        enable = true;
        commandLineArgs = [
          "--enable-features=AcceleratedVideoDecodeLinuxGL,AcceleratedVideoEncoder,VaapiIgnoreDriverChecks,TouchpadOverscrollHistoryNavigation,WaylandWindowDecorations"
          "--password-store=gnome-libsecret"
        ];
      };

      home.sessionVariables.BROWSER = "brave-origin";
    };
}
