{ ... }:
{
  flake.homeModules.kitty =
    {
      config,
      lib,
      pkgs,
      ...
    }:

    let
      session-switch = pkgs.writeShellScriptBin "kitty-session-switch" ''
        path="$1"
        if [ -z "$path" ]; then
          echo "Usage: kitty-session-switch <path>" >&2
          exit 1
        fi

        dirname=$(basename "$path")
        session_dir="/tmp/kitty/sessions"
        session_file="$session_dir/$dirname.kitty-session"

        mkdir -p "$session_dir"

        # Generate a session file if it doesn't exist yet
        if [ ! -f "$session_file" ]; then
          cat > "$session_file" <<EOF
        new_tab $dirname - $EDITOR
        cd $path
        launch $SHELL -c "$EDITOR; exec $SHELL"

        new_tab
        cd $path
        launch opencode --port

        new_tab
        cd $path
        launch

        focus_tab 0
        EOF
        fi

        # goto_session focuses the session if already active, otherwise opens the file
        kitten @ action goto_session "$session_file"
      '';
    in
    {
      programs.kitty = {
        enable = true;
        font.name = config.stylix.fonts.monospace.name;
        settings = {
          allow_remote_control = "socket-only";
          background_opacity = "0.9";
          confirm_os_window_close = 0;
          cursor = config.lib.stylix.colors.withHashtag.base07;
          cursor_shape = "block";
          cursor_text_color = "background";
          cursor_trail = 3;
          detect_urls = true;
          enable_audio_bell = false;
          enabled_layouts = "tall,stack";
          font_size = 10.0;
          hide_window_decorations = true;
          kitty_mod = "alt";
          listen_on = "unix:/tmp/kitty.sock";
          scrollback_pager = "nvim --cmd 'set eventignore=FileType' +'nnoremap q ZQ' +'call nvim_open_term(0, {})' +'set nomodified nolist' +'$' -";
          scrollback_lines = 10000;
          tab_bar_align = "center";
          tab_bar_edge = "top";
          tab_bar_filter = "session:~ or session:^$";
          tab_bar_min_tabs = 1;
          url_style = "curly";
          window_padding_width = "4 0";
        };
        keybindings = {
          # Sessions
          "kitty_mod+space" = "launch --type overlay tv kitty-sessions";
          "kitty_mod+tab" = "goto_session -1";

          # Tabs
          "kitty_mod+n" = "next_tab";
          "kitty_mod+p" = "previous_tab";
          "kitty_mod+t" = "new_tab_with_cwd";
          "kitty_mod+&" = "goto_tab 1";
          "kitty_mod+é" = "goto_tab 2";
          "kitty_mod+\"" = "goto_tab 3";
          "kitty_mod+'" = "goto_tab 4";
          "kitty_mod+(" = "goto_tab 5";
          "kitty_mod+-" = "goto_tab 6";
          "kitty_mod+è" = "goto_tab 7";
          "kitty_mod+_" = "goto_tab 8";
          "kitty_mod+ç" = "goto_tab 9";
          "kitty_mod+h" = "move_tab_backward";
          "kitty_mod+l" = "move_tab_forward";

          # Windows
          "ctrl+j" = "neighboring_window down";
          "ctrl+k" = "neighboring_window up";
          "ctrl+h" = "neighboring_window left";
          "ctrl+l" = "neighboring_window right";
          "kitty_mod+j" = "move_window_forward";
          "kitty_mod+k" = "move_window_backward";
          "kitty_mod+f" = "toggle_layout stack";
          "kitty_mod+q" = "close_window";
          "kitty_mod+enter" = "new_window_with_cwd";
          "kitty_mod+equal" = "resize_window reset";

          # Other
          "kitty_mod+esc" = "show_scrollback";
          "ctrl+backspace" = "send_key ctrl+w";
          "ctrl+shift+c" = "copy_to_clipboard";
          "ctrl+shift+v" = "paste_from_clipboard";
        };
        extraConfig = ''
          map --when-focus-on var:IS_NVIM ctrl+j
          map --when-focus-on var:IS_NVIM ctrl+k
          map --when-focus-on var:IS_NVIM ctrl+h
          map --when-focus-on var:IS_NVIM ctrl+l
        '';
      };

      home.packages = [ session-switch ];
    };
}
