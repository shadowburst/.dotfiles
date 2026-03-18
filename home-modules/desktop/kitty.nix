{ config, pkgs, ... }:
let
  dev-session = pkgs.writeShellScript "kitty-dev-session" ''
    cwd=$(kitten @ ls | jq -r '.[0].tabs[] | select(.is_active) | .windows[] | select(.is_active) | .cwd')
    kitten @ set-tab-title "Nvim - $(basename "$cwd")"
    kitten @ launch --type=tab --cwd=current --tab-title=Opencode opencode --port
    kitten @ launch --type=tab --cwd=current --tab-title=Github gh-dash
    kitten @ launch --type=tab --cwd=current
    kitten @ focus-tab --match title:Nvim
  '';
in
{
  programs.kitty = {
    enable = true;
    font.name = config.stylix.fonts.monospace.name;
    settings = {
      allow_remote_control = "socket-only";
      background_opacity = "0.9";
      confirm_os_window_close = -1;
      cursor = config.lib.stylix.colors.withHashtag.base07;
      cursor_shape = "block";
      cursor_text_color = "background";
      cursor_trail = 3;
      detect_urls = true;
      enabled_layouts = "tall,stack";
      font_size = 10.0;
      hide_window_decorations = true;
      kitty_mod = "ctrl+shift";
      listen_on = "unix:/tmp/kitty.sock";
      tab_bar_align = "center";
      tab_bar_edge = "top";
      tab_bar_min_tabs = 1;
      url_style = "curly";
      window_padding_width = "4 0";
    };
    keybindings = {
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
      "alt+j" = "kitten relative_resize.py down  3";
      "alt+k" = "kitten relative_resize.py up    3";
      "alt+h" = "kitten relative_resize.py left  3";
      "alt+l" = "kitten relative_resize.py right 3";
      "kitty_mod+j" = "move_window_forward";
      "kitty_mod+k" = "move_window_backward";
      "kitty_mod+f" = "toggle_layout stack";
      "kitty_mod+q" = "close_window";
      "kitty_mod+enter" = "new_window_with_cwd";
      "kitty_mod+equal" = "resize_window reset";

      # Other
      "ctrl+backspace" = "send_key ctrl+w";
      "kitty_mod+d" = "remote_control_script ${dev-session}";
    };
    extraConfig = ''
      map --when-focus-on var:IS_NVIM ctrl+j
      map --when-focus-on var:IS_NVIM ctrl+k
      map --when-focus-on var:IS_NVIM ctrl+h
      map --when-focus-on var:IS_NVIM ctrl+l
      map --when-focus-on var:IS_NVIM alt+j
      map --when-focus-on var:IS_NVIM alt+k
      map --when-focus-on var:IS_NVIM alt+h
      map --when-focus-on var:IS_NVIM alt+l
    '';
  };
}
