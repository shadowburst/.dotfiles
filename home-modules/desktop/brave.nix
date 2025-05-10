{pkgs, ...}: {
  home.sessionVariables = {
    BROWSER = "brave";
  };

  home.packages = with pkgs; [
    (brave.override {
      vulkanSupport = true;
      commandLineArgs = "--enable-features=AcceleratedVideoDecodeLinuxGL,AcceleratedVideoEncoder,VaapiVideoDecoder,VaapiIgnoreDriverChecks,Vulkan,DefaultANGLEVulkan,VulkanFromANGLE,TouchpadOverscrollHistoryNavigation --ozone-platform-hint=auto --password-store=gnome-libsecret";
    })
  ];
}
