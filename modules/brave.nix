_: {
  flake.homeModules.gui =
    { pkgs, ... }:
    {
      programs.brave.enable = true;

      home.sessionVariables.BROWSER = "brave";
    };

  flake.homeModules.zephyrus =
    { lib, pkgs, ... }:
    {
      programs.brave.commandLineArgs = [
        "--enable-features=AcceleratedVideoDecodeLinuxGL,AcceleratedVideoEncoder,VaapiVideoDecoder,VaapiIgnoreDriverChecks,TouchpadOverscrollHistoryNavigation"
        "--ozone-platform-hint=auto"
        "--password-store=gnome-libsecret"
      ];
    };

  flake.homeModules.lenovo-p14s =
    { lib, pkgs, ... }:
    {
      programs.brave = {
        package = pkgs.brave.override {
          vulkanSupport = true;
        };
        commandLineArgs = [
          "--enable-features=AcceleratedVideoDecodeLinuxGL,AcceleratedVideoEncoder,VaapiVideoDecoder,VaapiIgnoreDriverChecks,Vulkan,DefaultANGLEVulkan,VulkanFromANGLE,TouchpadOverscrollHistoryNavigation"
          "--ozone-platform-hint=auto"
          "--password-store=gnome-libsecret"
        ];
      };
    };
}
