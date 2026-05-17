_: {
  flake.homeModules.opencode =
    { lib, pkgs, ... }:
    {
      programs.opencode = {
        enable = true;
        settings = {
          lsp = false;
        };
        tui = {
          keybinds = {
            leader = "ctrl+space";
            command_list = "<leader>p";
            messages_half_page_up = "ctrl+u";
            messages_half_page_down = "ctrl+d";
            input_newline = "shift+enter";
          };
        };
        web.enable = true;
      };
    };
}
