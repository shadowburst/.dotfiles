{...}: {
  programs.brave = {
    enable = true;
    commandLineArgs = [
      "--enable-features=AcceleratedVideoDecodeLinuxGL,AcceleratedVideoEncoder,VaapiVideoDecoder,VaapiIgnoreDriverChecks,TouchpadOverscrollHistoryNavigation"
      "--ozone-platform-hint=auto"
      "--password-store=gnome-libsecret"
    ];
  };

  home.sessionVariables = {
    BROWSER = "brave";
  };
}
