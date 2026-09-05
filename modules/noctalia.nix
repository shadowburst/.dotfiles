_: {
  flake.nixosModules.gui =
    { ... }:
    {
      programs.gpu-screen-recorder.enable = true;

      services.displayManager.noctalia-greeter = {
        enable = true;
        settings.keyboard = {
          layout = "fr";
          variant = "azerty";
        };
      };

      services.gnome.gnome-keyring.enable = true;
      security.pam.services.greetd.enableGnomeKeyring = true;
    };

  flake.homeModules.gui =
    { config, lib, ... }:
    {
      programs.noctalia = {
        enable = true;
        systemd.enable = true;
        checkConfig = false;
        settings = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/config/noctalia/config.toml";
      };

      systemd.user.services.noctalia.Service = {
        Type = "dbus";
        BusName = "org.kde.StatusNotifierWatcher";
      };
      systemd.user.services.noctalia.Install.WantedBy = [ "tray.target" ];

      programs.satty = {
        enable = true;
        settings.general = {
          output-filename = "~/Pictures/Screenshots/Screenshot-%Y-%m-%d_%H-%M-%S.png";
          actions-on-enter = [ "save-to-file" ];
        };
      };

      home.activation.createScreenshotsDirectory = lib.hm.dag.entryAfter [ "linkGeneration" ] ''
        run mkdir -p $VERBOSE_ARG "${config.home.homeDirectory}/Pictures/Screenshots"
      '';

      xdg.stateFile."noctalia/settings.toml".source =
        config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/config/noctalia/settings.toml";
    };
}
