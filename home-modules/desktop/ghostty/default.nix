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
      cursor-color = config.lib.stylix.colors.withHashtag.base07;
      background-opacity = 0.9;
      resize-overlay = "never";
      notify-on-command-finish = "unfocused";
      window-padding-y = 2;
      window-padding-color = "extend";
      window-decoration = "none";
      keybind = [
        "ctrl+backspace=text:\\x17" # C-W

        # Windows
        "ctrl+shift+n=next_tab"
        "ctrl+shift+p=previous_tab"
        "ctrl+shift+t=new_tab"
        "ctrl+shift+enter=new_split"
        # Panes
        "ctrl+shift+digit_1=goto_tab:1"
        "ctrl+shift+digit_2=goto_tab:2"
        "ctrl+shift+digit_3=goto_tab:3"
        "ctrl+shift+digit_4=goto_tab:4"
        "ctrl+shift+digit_5=goto_tab:5"
        "ctrl+shift+digit_6=goto_tab:6"
        "ctrl+shift+digit_7=goto_tab:7"
        "ctrl+shift+digit_8=goto_tab:8"
        "ctrl+shift+digit_9=goto_tab:9"
        "ctrl+shift+e=write_scrollback_file:paste"
        "ctrl+shift+f=toggle_split_zoom"
        "ctrl+shift+h=goto_split:left"
        "ctrl+shift+j=goto_split:down"
        "ctrl+shift+k=goto_split:up"
        "ctrl+shift+l=goto_split:right"
        "ctrl+shift+q=close_surface"
        "ctrl+shift+equal=close_surface"
      ];
      custom-shader = [
        "${./shaders/cursor_smear.glsl}"
      ];
    };
  };
}
