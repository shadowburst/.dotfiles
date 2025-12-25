{...}: {
  imports = [
    ./bluetooth.nix
    ./dms.nix
    ./power.nix
  ];

  programs.hyprland.enable = true;
  security.polkit.enable = true;
}
