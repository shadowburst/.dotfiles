_: {
  flake.homeModules.gui =
    { config, ... }:
    {
      programs.kitty = {
        enable = true;
        font.name = config.stylix.fonts.monospace.name;
        settings = {
          auto_reload_config = -1;
          background_opacity = "0.9";
          confirm_os_window_close = 0;
          cursor = config.lib.stylix.colors.withHashtag.base07;
          cursor_shape = "block";
          cursor_text_color = "background";
          cursor_trail = 3;
          detect_urls = true;
          enable_audio_bell = false;
          font_size = 10.0;
          hide_window_decorations = true;
          scrollback_pager = "nvim --cmd 'set eventignore=FileType' +'nnoremap q ZQ' +'call nvim_open_term(0, {})' +'set nomodified nolist' +'$' -";
          scrollback_lines = 10000;
          url_style = "curly";
          window_padding_width = "4 0";
        };
        keybindings = {
          # Translate AZERTY's top row for Herdr's indexed shortcuts.
          "alt+&" = "send_key alt+1";
          "alt+é" = "send_key alt+2";
          "alt+\"" = "send_key alt+3";
          "alt+'" = "send_key alt+4";
          "alt+(" = "send_key alt+5";
          "alt+-" = "send_key alt+6";
          "alt+è" = "send_key alt+7";
          "alt+_" = "send_key alt+8";
          "alt+ç" = "send_key alt+9";
          "ctrl+backspace" = "send_key ctrl+w";
          "ctrl+delete" = "send_key alt+d";
        };
      };
    };
}
