_:
let
  commandLineArgs = [
    "--enable-features=AcceleratedVideoDecodeLinuxGL,AcceleratedVideoEncoder,VaapiIgnoreDriverChecks,TouchpadOverscrollHistoryNavigation,WaylandWindowDecorations"
    "--password-store=gnome-libsecret"
  ];
in
{
  flake.homeModules.gui =
    { ... }:
    {
      programs.brave-origin = {
        enable = true;
        inherit commandLineArgs;
      };

      home.sessionVariables.BROWSER = "brave-origin";
    };

  flake.homeModules.lenovo-p14s =
    { lib, ... }:
    {
      programs.brave-origin.enable = lib.mkForce false;
      programs.brave = {
        enable = true;
        inherit commandLineArgs;
      };

      home.sessionVariables.BROWSER = lib.mkForce "brave";
    };
}
