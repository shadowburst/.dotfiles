_:
{
  flake.homeModules.xps-9305 =
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

      programs.git.settings = {
        user.name = lib.mkForce "pbaudry";
        user.email = lib.mkForce "p.baudry@lynx-business.com";
      };
    };
}
