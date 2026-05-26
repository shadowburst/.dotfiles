_: {
  flake.nixosModules.noctalia =
    {
      lib,
      pkgs,
      ...
    }:
    {
      programs.gpu-screen-recorder.enable = true;
    };

  flake.homeModules.noctalia =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    {
      home.packages = with pkgs; [
        noctalia-shell
        gpu-screen-recorder
      ];


      xdg.configFile = {
        "noctalia/colors.json".source =
          config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/config/noctalia/colors.json";
        "noctalia/settings.json".source =
          config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/config/noctalia/settings.json";

        "noctalia/plugins.json".source =
          config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/config/noctalia/plugins.json";
        "noctalia/plugins/pomodoro/settings.json".source =
          config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/config/noctalia/plugins/pomodoro.json";
        "noctalia/plugins/screen-recorder/settings.json".source =
          config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/config/noctalia/plugins/screen-recorder.json";
      };

      home.sessionVariables.QT_AUDIO_BACKEND = "pulseaudio";
    };
}
