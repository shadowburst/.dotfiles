{...}: {
  imports = [
    ./audio.nix
    # ./cosmic.nix
    ./gaming.nix
    ./hypr
    ./printing.nix
    ./stylix.nix
  ];

  programs = {
    gnome-disks.enable = true;
    seahorse.enable = true;
  };
}
