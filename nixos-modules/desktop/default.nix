{...}: {
  imports = [
    ./audio.nix
    ./gaming.nix
    ./hypr
    ./printers.nix
    ./stylix.nix
  ];

  programs = {
    gnome-disks.enable = true;
    seahorse.enable = true;
  };
}
