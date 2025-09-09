{config, ...}: {
  programs.kitty = {
    enable = true;
    font.name = config.stylix.fonts.monospace.name;
    settings = {
      hide_window_decorations = true;
      background_opacity = "0.9";
      confirm_os_window_close = 0;
      cursor_shape = "block";
      cursor_text_color = "background";
      cursor_trail = 3;
      detect_urls = true;
      url_style = "curly";
      window_padding_width = "4 0";
    };
    keybindings = {
      "shift+enter" = "send_key alt+enter";
    };
  };

  home.sessionVariables.TERMINAL = "kitty";
}
