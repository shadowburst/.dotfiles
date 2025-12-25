{...}: {
  imports = [
    ./audio.nix
    ./gaming.nix
    ./hypr
    ./printers.nix
    ./stylix.nix
  ];

  programs.gnome-disks.enable = true;
  programs.gpu-screen-recorder.enable = true;
  programs.seahorse.enable = true;

  qt = {
    enable = true;
    style = "kvantum";
  };
}
