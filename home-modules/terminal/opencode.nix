{...}: {
  programs.opencode = {
    enable = true;
    settings = {
      permission.edit = "ask";
      keybinds = {
        command_list = "<leader>p";
        messages_half_page_up = "ctrl+u";
        messages_half_page_down = "ctrl+d";
        input_newline = "shift+enter";
      };
    };
  };
}
