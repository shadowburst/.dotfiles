{pkgs, ...}: {
  home.sessionVariables = {
    BROWSER = "brave";
  };

  programs.brave = {
    enable = true;
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
