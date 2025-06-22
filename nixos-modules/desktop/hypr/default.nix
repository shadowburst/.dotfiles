{...}: {
  imports = [
    ./bluetooth.nix
    ./greetd.nix
    ./hyprland.nix
    ./power.nix
    ./quickshell.nix
  ];

  environment.sessionVariables.NIXOS_OZONE_WL = "1";
}
