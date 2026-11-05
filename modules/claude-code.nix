_: {
  flake.homeModules.cli =
    { pkgs, ... }:
    {
      home.file.".claude/keybindings.json".text = builtins.toJSON {
        "$schema" = "https://www.schemastore.org/claude-code-keybindings.json";
        bindings = [
          {
            context = "Chat";
            bindings = {
              "shift+tab" = "command:effort";
              "meta+m" = "chat:cycleMode";
            };
          }
        ];
      };

      programs.claude-code = {
        enable = true;
        mutableSettings = true;
        context = ''
          Reply in ASD-STE100 Simplified Technical English.

          During grilling sessions, ask every round through the `AskUserQuestion` tool, batching the whole frontier into one call.

          Inside Herdr (`HERDR_ENV=1`), transfer each new worktree to a new agent before you change any file. Temporary worktrees that you remove in the same run stay with you.

          1. `herdr worktree open --cwd <main checkout> --path <worktree> --no-focus`; read `.result.root_pane.pane_id`.
          2. `herdr agent start <slug> --kind claude --pane <pane id>`, with `<slug>` matching `[a-z][a-z0-9_-]{0,31}`.
          3. `herdr agent prompt <slug> "<brief>"`, with the user's request verbatim, the base branch, and your decisions so far.
          4. When `herdr agent wait <slug> --until working --timeout 30000` succeeds, give the user the agent name and end your turn. When a step fails, continue in the worktree yourself.
        '';
        plugins = {
          "ponytail" = pkgs.ponytail.src;
        };
        commands = {
          commit = ''
            ---
            description: Create Conventional Commit(s) from current changes
            model: claude-haiku-4-5-20251001
            ---

            Use the `commit` skill with $ARGUMENTS.
          '';
          pr = ''
            ---
            description: Create or update a GitHub pull request
            model: claude-haiku-4-5-20251001
            ---

            Use the `pr` skill with $ARGUMENTS.
          '';
        };
      };
    };
}
