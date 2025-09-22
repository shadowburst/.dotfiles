{...}: {
  programs.opencode = {
    enable = true;
    settings = {
      theme = "catppuccin";
      model = "github-copilot/gpt-4.1";
      keybinds = {
        messages_half_page_up = "ctrl+u";
        messages_half_page_down = "ctrl+d";
        input_newline = "alt+enter";
      };
    };
  };

  xdg.configFile."opencode/themes" = {
    source = ./themes;
    recursive = true;
  };
}
