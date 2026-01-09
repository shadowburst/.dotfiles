{...}: {
  programs.opencode = {
    enable = true;
    settings = {
      permission.edit = "ask";
      keybinds = {
        messages_half_page_up = "ctrl+u";
        messages_half_page_down = "ctrl+d";
        input_newline = "shift+enter";
      };
    };
  };
}
