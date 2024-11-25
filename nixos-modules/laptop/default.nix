{ ... }:

{
  imports = [
    ./audio.nix
    ./bluetooth.nix
    ./gaming.nix
    ./greetd.nix
    ./hyprland.nix
    ./power.nix
    ./printing.nix
    ./stylix
  ];

  programs.gnome-disks.enable = true;
}
