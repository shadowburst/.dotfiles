{...}: {
  imports = [
    ./greetd.nix
    ./hyprland.nix
    ./power.nix
  ];

  security.polkit.enable = true;
}
