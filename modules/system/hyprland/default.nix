{ ... }:

{
  programs.hyprland.enable = true;

  security = {
    pam.services.hyprlock = { };
    polkit.enable = true;
  };
}
