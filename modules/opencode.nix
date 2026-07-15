_: {
  flake.homeModules.cli =
    { ... }:
    {
      programs.opencode = {
        enable = true;
        enableMcpIntegration = true;
        context = ''
          Only use subagents if explicitly asked to do so.
        '';
        settings = {
          permission = {
            "*" = "allow";
            question = "deny";
          };
          command = {
            commit = {
              description = "Create Conventional Commit(s) from current changes";
              model = "openai/gpt-5.4-mini";
              subtask = true;
              template = "Use the `commit` skill with $ARGUMENTS.";
            };
            pr = {
              description = "Create or update a GitHub pull request";
              model = "openai/gpt-5.4-mini";
              subtask = true;
              template = "Use the `pr` skill with $ARGUMENTS.";
            };
          };
        };
        tui = {
          keybinds = {
            leader = "ctrl+space";
            app_exit = "ctrl+q";
            command_list = "<leader>p";
            agent_cycle = "none";
            agent_cycle_reverse = "none";
            variant_cycle = "shift+tab";
            session_fork = "<leader>f";
            messages_half_page_up = "ctrl+u";
            messages_half_page_down = "ctrl+d";
            input_newline = "shift+enter";
            prompt_skills = "$";
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
