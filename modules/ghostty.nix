_: {
  flake.homeModules.gui =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    {
      programs.ghostty = {
        enable = true;
        settings = {
          font-family = with config.stylix; [
            fonts.monospace.name
            fonts.emoji.name
          ];
          font-size = 10;
          background-opacity = 0.9;
          cursor-color = config.catppuccin.palette.colors.lavender.hex;
          notify-on-command-finish = "unfocused";
          notify-on-command-finish-action = "no-bell,notify";
          resize-overlay = "never";
          confirm-close-surface = false;
          window-padding-y = 2;
          window-padding-color = "extend";
          window-decoration = "none";
          keybind = [
            "ctrl+v=paste_from_clipboard"
            "ctrl+backspace=text:\\x17" # C-W
          ];
          custom-shader = [
            "${config.home.homeDirectory}/.dotfiles/config/ghostty/shaders/cursor_smear.glsl"
          ];
        };
      };
    };
}
