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
            # Herdr bindings - Workspaces
            "ctrl+shift+space=text:\\x1b\\x20" # M-Space
            "ctrl+shift+tab=text:\\x1b\\x09" # M-Tab

            # Herdr bindings - Tabs
            "ctrl+shift+n=text:\\x1bn" # M-n
            "ctrl+shift+p=text:\\x1bp" # M-p
            "ctrl+shift+t=text:\\x1bt" # M-t

            # Herdr bindings - Panes
            "ctrl+shift+b=text:\\x1bb" # M-b
            "ctrl+shift+f=text:\\x1bf" # M-f
            "ctrl+shift+q=text:\\x1bq" # M-q

            # Other
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
