{...}: {
  imports = [
    ./audio.nix
    ./gaming.nix
    ./hypr
    ./printers.nix
  ];

  programs.gnome-disks.enable = true;
  programs.gpu-screen-recorder.enable = true;
  programs.seahorse.enable = true;
}
