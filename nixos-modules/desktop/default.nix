{...}: {
  imports = [
    ./audio.nix
    # ./cosmic.nix
    ./gaming.nix
    ./hypr
    ./printing.nix
    ./stylix.nix
  ];

  programs.gnome-disks.enable = true;
  programs.seahorse.enable = true;
}
