{ inputs, ... }:
{
  flake.nixosModules.gui =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    let
      greeterPackage = config.programs.noctalia-greeter.package;
    in
    {
      imports = [ inputs.noctalia-greeter.nixosModules.default ];

      programs.gpu-screen-recorder.enable = true;
      programs.noctalia-greeter.enable = true;

      services.greetd = {
        enable = true;
        useTextGreeter = false;
        settings.default_session = {
          user = "greeter";
          command = lib.mkForce "${pkgs.coreutils}/bin/env XKB_DEFAULT_LAYOUT=fr XKB_DEFAULT_VARIANT=azerty ${greeterPackage}/bin/noctalia-greeter-session --";
        };
      };

      services.gnome.gnome-keyring.enable = true;
      security.pam.services.greetd.enableGnomeKeyring = true;

    };

  flake.homeModules.gui =
    { config, lib, ... }:
    {
      imports = [ inputs.noctalia.homeModules.default ];

      programs.noctalia = {
        enable = true;
        systemd.enable = true;
      };

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

      xdg.configFile."noctalia/config.toml".source =
        config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/config/noctalia/config.toml";

      xdg.stateFile."noctalia/settings.toml".source =
        config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/config/noctalia/settings.toml";
    };
}
