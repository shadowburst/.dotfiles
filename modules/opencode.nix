_: {
  flake.homeModules.cli =
    { ... }:
    {
      programs.opencode = {
        enable = true;
        enableMcpIntegration = true;
        settings = {
          permission = {
            "*" = "allow";
            question = "deny";
          };
          command = {
            commit = {
              description = "Create a Conventional Commit from current changes";
              model = "openai/gpt-5.4-mini";
              subtask = true;
              template = builtins.readFile ../config/opencode/commands/commit.md;
            };
            pr = {
              description = "Create or update a GitHub pull request";
              model = "openai/gpt-5.4-mini";
              subtask = true;
              template = builtins.readFile ../config/opencode/commands/pr.md;
            };
          };
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
      };
    };

  flake.homeModules.gui =
    { config, pkgs, ... }:
    {
      home.packages = [ pkgs.opencode-desktop ];

      xdg.configFile."ai.opencode.desktop/opencode.settings".source =
        config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/config/opencode/opencode.settings";
    };
}
