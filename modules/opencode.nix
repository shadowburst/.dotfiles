_: {
  flake.homeModules.cli =
    { ... }:
    {
      programs.opencode = {
        enable = true;
        mutableSettings = true;
        context = ''
          Reply in ASD-STE100 Simplified Technical English.

          During grilling sessions, ask every round through the `question` tool, batching the whole frontier into one call.

          Inside Herdr (`HERDR_ENV=1`), transfer each new worktree to a new agent before you change any file. Temporary worktrees that you remove in the same run stay with you.

          1. `herdr worktree open --cwd <main checkout> --path <worktree> --no-focus`; read `.result.root_pane.pane_id`.
          2. `herdr agent start <slug> --kind opencode --pane <pane id>`, with `<slug>` matching `[a-z][a-z0-9_-]{0,31}`.
          3. `herdr agent prompt <slug> "<brief>"`, with the user's request verbatim, the base branch, and your decisions so far.
          4. When `herdr agent wait <slug> --until working --timeout 30000` succeeds, give the user the agent name and end your turn. When a step fails, continue in the worktree yourself.
        '';
        settings = {
          lsp = false;
          permissions = [
            {
              action = "*";
              resource = "*";
              effect = "allow";
            }
          ];
          plugins = [
            "@dietrichgebert/ponytail@5.3.3"
          ];
        };
        cli = {
          animations = true;
          session = {
            sidebar = "auto";
            image_preview = true;
          };
          tabs.mode = "off";
          diffs.view = "auto";
          keybinds = {
            leader = "ctrl+space";
            "app.exit" = "ctrl+q";
            "command.palette.show" = "<leader>p";
            "agent.cycle" = "none";
            "agent.cycle.reverse" = "none";
            "variant.cycle" = "shift+tab";
            "session.fork" = "<leader>f";
            "session.half.page.up" = "ctrl+u";
            "session.half.page.down" = "ctrl+d";
            "input.newline" = "shift+return";
          };
        };
        validateFiles = {
          config = true;
          cli = true;
        };
      };
    };
}
