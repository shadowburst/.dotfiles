{...}: {
  programs.brave.commandLineArgs = [
    "--enable-features=AcceleratedVideoDecodeLinuxGL,AcceleratedVideoEncoder,VaapiVideoDecoder,VaapiIgnoreDriverChecks,TouchpadOverscrollHistoryNavigation"
    "--ozone-platform-hint=auto"
    "--password-store=gnome-libsecret"
  ];
}
