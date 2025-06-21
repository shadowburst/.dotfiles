{...}: {
  imports = [
    ./bluetooth.nix
    ./greetd.nix
    ./power.nix
    ./quickshell.nix
  ];

  environment.sessionVariables.NIXOS_OZONE_WL = "1";

  programs.hyprland.enable = true;

  security = {
    pam.services.hyprlock = {};
    polkit.enable = true;
  };
}
