{...}: {
  imports = [
    ./bluetooth.nix
    ./greetd.nix
    ./power.nix
    ./quickshell.nix
  ];

  programs.hyprland.enable = true;

  security = {
    pam.services.hyprlock = {};
    polkit.enable = true;
  };
}
