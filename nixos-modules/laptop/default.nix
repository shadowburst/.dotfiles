{...}: {
  imports = [
    ./audio.nix
    ./bluetooth.nix
    ./cosmic.nix
    ./gaming.nix
    # ./greetd.nix
    # ./hyprland.nix
    ./power.nix
    ./printing.nix
    ./stylix
  ];

  programs.gnome-disks.enable = true;
}
