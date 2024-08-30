{ pkgs, ... }:

{
  programs.regreet.enable = true;
  # security.pam.services.greetd.enableGnomeKeyring = true;

  # systemd.services.greetd.serviceConfig = {
  #   Type = "idle";
  #   StandardInput = "tty";
  #   StandardOutput = "tty";
  #   StandardError = "journal";
  #   TTYReset = true;
  #   TTYVHangup = true;
  #   TTYVTDisallocate = true;
  # };
}
