{config, ...}: {
  programs.kitty = {
    enable = false;
    font.name = config.stylix.fonts.monospace.name;
    settings = {
      hide_window_decorations = true;
      background_opacity = "0.9";
      confirm_os_window_close = 0;
      cursor_shape = "block";
      cursor_text_color = "background";
      cursor_trail = 3;
      cursor = config.lib.stylix.colors.withHashtag.base07;
      detect_urls = true;
      font_size = 10.0;
      url_style = "curly";
      window_padding_width = "4 0";
    };
    keybindings = {
      "ctrl+backspace" = "send_key ctrl+w";

      # Tmux bindings - Sessions
      "ctrl+shift+a" = "send_key alt+a";
      "ctrl+shift+d" = "send_key alt+d";
      "ctrl+shift+r" = "send_key alt+r";
      "ctrl+shift+space" = "send_key alt+space";
      "ctrl+shift+tab" = "send_key alt+tab";

      # Tmux bindings - Windows
      "ctrl+shift+n" = "send_key alt+n";
      "ctrl+shift+p" = "send_key alt+p";
      "ctrl+shift+t" = "send_key alt+t";
      "ctrl+shift+enter" = "send_key alt+enter";

      # Tmux bindings - Panes
      "ctrl+shift+b" = "send_key alt+b";
      "ctrl+shift+e" = "send_key alt+e";
      "ctrl+shift+f" = "send_key alt+f";
      "ctrl+shift+h" = "send_key alt+shift+h";
      "ctrl+shift+j" = "send_key alt+shift+j";
      "ctrl+shift+k" = "send_key alt+shift+k";
      "ctrl+shift+l" = "send_key alt+shift+l";
      "ctrl+shift+o" = "send_key alt+o";
      "ctrl+shift+q" = "send_key alt+q";
      "ctrl+shift+x" = "send_key alt+x";
    };
  };
}
