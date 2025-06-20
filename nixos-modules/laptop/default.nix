{...}: {
  imports = [
    ./audio.nix
    # ./cosmic.nix
    ./gaming.nix
    ./hyprland
    ./printing.nix
    ./stylix
  ];

  programs.gnome-disks.enable = true;
}
