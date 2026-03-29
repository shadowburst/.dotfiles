{ config, ... }:
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
      cursor-color = config.lib.stylix.colors.withHashtag.base07;
      notify-on-command-finish = "unfocused";
      notify-on-command-finish-action = "no-bell,notify";
      resize-overlay = "never";
      confirm-close-surface = false;
      window-padding-y = 2;
      window-padding-color = "extend";
      window-decoration = "none";
      keybind = [
        # Tmux bindings - Sessions
        "ctrl+shift+a=text:\\x1ba" # M-a
        "ctrl+shift+d=text:\\x1bd" # M-d
        "ctrl+shift+r=text:\\x1br" # M-r
        "ctrl+shift+space=text:\\x1b\\x20" # M-Space
        "ctrl+shift+tab=text:\\x1b\\x09" # M-Tab

        # Tmux bindings - Windows
        "ctrl+shift+n=text:\\x1bn" # M-n
        "ctrl+shift+p=text:\\x1bp" # M-p
        "ctrl+shift+t=text:\\x1bt" # M-t
        "ctrl+shift+enter=text:\\x1b\\x0d" # M-Enter

        # Tmux bindings - Panes
        "ctrl+shift+b=text:\\x1bb" # M-b
        "ctrl+shift+e=text:\\x1be" # M-e
        "ctrl+shift+f=text:\\x1bf" # M-f
        "ctrl+shift+h=text:\\x1bH" # M-H
        "ctrl+shift+j=text:\\x1bJ" # M-J
        "ctrl+shift+k=text:\\x1bK" # M-K
        "ctrl+shift+l=text:\\x1bL" # M-L
        "ctrl+shift+o=text:\\x1bo" # M-o
        "ctrl+shift+q=text:\\x1bq" # M-q
        "ctrl+shift+x=text:\\x1bx" # M-x

        # Other
        "ctrl+backspace=text:\\x17" # C-W

      ];
      custom-shader = [
        "${./shaders/cursor_smear.glsl}"
      ];
    };
  };
}
