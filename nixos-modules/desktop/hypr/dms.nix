{username, ...}: {
  programs.dms-shell.enable = true;

  services.displayManager.dms-greeter = {
    enable = true;
    configHome = "/home/${username}";
    compositor = {
      name = "hyprland";
      customConfig = ''
        input {
          touchpad {
            disable_while_typing=true
            drag_lock=true
            natural_scroll=true
          }
          follow_mouse=1
          kb_layout=fr
          kb_options=caps:escape_shifted_capslock
          kb_variant=azerty
          numlock_by_default=true
          repeat_delay=300
        }
      '';
    };
  };

  services.gnome.gnome-keyring.enable = true;
  security.pam.services.dms-greeter.enableGnomeKeyring = true;
  security.pam.services.greetd.enableGnomeKeyring = true;
}
