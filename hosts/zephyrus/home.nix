_:
{
  flake.homeModules.zephyrus =
    { lib, pkgs, ... }:
    {
      programs.brave.commandLineArgs = [
        "--enable-features=AcceleratedVideoDecodeLinuxGL,AcceleratedVideoEncoder,VaapiVideoDecoder,VaapiIgnoreDriverChecks,TouchpadOverscrollHistoryNavigation"
        "--ozone-platform-hint=auto"
        "--password-store=gnome-libsecret"
      ];

      wayland.windowManager.hyprland.settings.env = [
        "AQ_DRM_DEVICES,/dev/dri/amd-igpu:/dev/dri/nvidia-dgpu"
      ];
    };
}
