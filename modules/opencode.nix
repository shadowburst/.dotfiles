_: {
  flake.homeModules.cli =
    { lib, pkgs, ... }:
    {
      programs.opencode = {
        enable = true;
        enableMcpIntegration = true;
        settings = {
          lsp = false;
          permission = "allow";
          agent.plan.disable = true;
        };
        tui = {
          keybinds = {
            leader = "ctrl+space";
            command_list = "<leader>p";
            session_fork = "<leader>f";
            messages_half_page_up = "ctrl+u";
            messages_half_page_down = "ctrl+d";
            input_newline = "shift+enter";
          };
        };
        web.enable = true;
      };
    };
}
