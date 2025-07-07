{pkgs, ...}: {
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
}
