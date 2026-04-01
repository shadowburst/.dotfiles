{ ... }:
{
  flake.homeModules.opencode =
    { lib, pkgs, ... }:
    {
      programs.opencode = {
        enable = true;
        settings = {
          permission.edit = "ask";
          keybinds = {
            leader = "ctrl+space";
            command_list = "<leader>p";
            messages_half_page_up = "ctrl+u";
            messages_half_page_down = "ctrl+d";
            input_newline = "shift+enter";
          };
        };
        agents = {
          review = ''
            ---
            description: Reviews uncommitted changes for quality, correctness, and best practices
            mode: subagent
            permission:
              edit: deny
              bash:
                "*": deny
                "git diff*": allow
                "git status*": allow
                "git log*": allow
            ---

            You are a senior code reviewer. Your task is to review the current uncommitted changes.

            Start by running `git diff` and `git status` to gather the changes, then provide a thorough review covering:

            - Correctness and potential bugs
            - Code quality and readability
            - Security considerations
            - Performance implications
            - Adherence to existing patterns in the codebase

            Do not make any changes. Only provide feedback and suggestions.
          '';
        };
      };
    };
}
