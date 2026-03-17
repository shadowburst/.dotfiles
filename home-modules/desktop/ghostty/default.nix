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
      window-decoration = "none";
      window-new-tab-position = "end";
      window-padding-color = "extend";
      window-padding-y = 2;
      window-show-tab-bar = "always";
      keybind = [
        # Tabs
        "ctrl+shift+n=next_tab"
        "ctrl+shift+p=previous_tab"
        "ctrl+shift+t=new_tab"
        "ctrl+shift+digit_1=goto_tab:1"
        "ctrl+shift+digit_2=goto_tab:2"
        "ctrl+shift+digit_3=goto_tab:3"
        "ctrl+shift+digit_4=goto_tab:4"
        "ctrl+shift+digit_5=goto_tab:5"
        "ctrl+shift+digit_6=goto_tab:6"
        "ctrl+shift+digit_7=goto_tab:7"
        "ctrl+shift+digit_8=goto_tab:8"
        "ctrl+shift+digit_9=goto_tab:9"

        # Panes
        "ctrl+shift+f=toggle_split_zoom"
        "ctrl+shift+h=goto_split:left"
        "ctrl+shift+j=goto_split:down"
        "ctrl+shift+k=goto_split:up"
        "ctrl+shift+l=goto_split:right"
        "ctrl+shift+q=close_surface"
        "ctrl+shift+enter=new_split"
        "ctrl+shift+equal=equalize_splits"

        # Other
        "ctrl+backspace=text:\\x17" # C-W
        "ctrl+shift+r=prompt_tab_title"
        "ctrl+shift+e=write_scrollback_file:paste"
      ];
      custom-shader = [
        "${./shaders/cursor_smear.glsl}"
      ];
    };
  };
}
