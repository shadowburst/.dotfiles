{pkgs, ...}: {
  home.sessionVariables = {
    BROWSER = "brave";
  };

  home.packages = with pkgs; [
    (writeShellScriptBin "brave" ''
      exec ${pkgs.brave}/bin/brave --enable-features=AcceleratedVideoDecodeLinuxGL,AcceleratedVideoEncoder,VaapiVideoDecoder --ozone-platforme=auto --password-store=gnome-libsecret "$@"
    '')
  ];
}
