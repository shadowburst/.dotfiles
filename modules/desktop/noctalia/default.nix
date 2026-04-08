{ ... }:
{
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

      wayland.windowManager.hyprland.settings.exec = [
        "noctalia-shell kill; sleep 1.5; noctalia-shell"
      ];
      wayland.windowManager.hyprland.settings.bind = [
        # Core
        "$mod, Space, exec, noctalia-shell ipc call launcher toggle"
        "$mod, x, exec, noctalia-shell ipc call sessionMenu toggle"
        "$mod, a, exec, noctalia-shell ipc call calendar toggle"

        # Audio
        ", xf86audiomute, exec, noctalia-shell ipc call volume muteOutput"
        ", xf86audiolowervolume, exec, noctalia-shell ipc call volume decrease"
        ", xf86audioraisevolume, exec, noctalia-shell ipc call volume increase"
        ", xf86audiomicmute, exec, noctalia-shell ipc call volume muteInput"
        ", xf86audioprev, exec, noctalia-shell ipc call media previous"
        ", xf86audionext, exec, noctalia-shell ipc call media next"
        ", xf86audioplay, exec, noctalia-shell ipc call media playPause"
        ", xf86audiopause, exec, noctalia-shell ipc call media playPause"
        "$mod CTRL, Space, exec, noctalia-shell ipc call media playPause"

        # Brightness
        ", xf86monbrightnessdown, exec, noctalia-shell ipc call brightness decrease"
        ", xf86monbrightnessup, exec, noctalia-shell ipc call brightness increase"

        # Utility
        "$mod, v, exec, noctalia-shell ipc call launcher clipboard"
        "$mod CTRL, r, exec, noctalia-shell ipc call plugin:screen-recorder toggle"
      ];

      xdg.configFile = {
        "noctalia/colors.json".source =
          config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/modules/desktop/noctalia/config/colors.json";
        "noctalia/settings.json".source =
          config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/modules/desktop/noctalia/config/settings.json";

        "noctalia/plugins.json".source =
          config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/modules/desktop/noctalia/config/plugins.json";
        "noctalia/plugins/pomodoro/settings.json".source =
          config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/modules/desktop/noctalia/config/plugins/pomodoro.json";
        "noctalia/plugins/screen-recorder/settings.json".source =
          config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/modules/desktop/noctalia/config/plugins/screen-recorder.json";
      };

      home.sessionVariables.QT_AUDIO_BACKEND = "pulseaudio";
    };
}
