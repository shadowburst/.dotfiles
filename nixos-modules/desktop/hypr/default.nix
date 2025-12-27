{...}: {
  imports = [
    ./bluetooth.nix
    ./greetd.nix
    ./power.nix
  ];

  programs.hyprland.enable = true;
  security.polkit.enable = true;
}
