{...}: {
  imports = [
    ./audio.nix
    ./gaming.nix
    ./hyprland.nix
    ./power.nix
    ./printers.nix
  ];

  programs.gnome-disks.enable = true;
  programs.gpu-screen-recorder.enable = true;
  programs.seahorse.enable = true;

  security.polkit.enable = true;
}
