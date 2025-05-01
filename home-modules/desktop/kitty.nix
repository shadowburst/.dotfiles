{config, ...}: {
  programs.kitty = {
    enable = true;
    font.name = config.stylix.fonts.monospace.name;
    shellIntegration.enableFishIntegration = true;
    settings = {
      cursor_text_color = "background";
      cursor_shape = "block";

      url_style = "curly";
      detect_urls = true;

      window_padding_width = "4 0";
      confirm_os_window_close = 0;

      background_opacity = "1";
      cursor_trail = 3;
    };
    themeFile = "Catppuccin-Macchiato";
  };

  home.sessionVariables = {
    TERMINAL = "kitty";
  };
}
