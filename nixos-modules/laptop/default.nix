{...}: {
  imports = [
    ./audio.nix
    ./cosmic.nix
    ./gaming.nix
    ./printing.nix
    ./stylix
  ];

  programs.gnome-disks.enable = true;
}
