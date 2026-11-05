_: {
  flake.homeModules.cli =
    { pkgs, ... }:
    {
      programs.codex = {
        enable = true;
        mutableSettings = true;
        context = ''
          Reply in ASD-STE100 Simplified Technical English.

          During grilling sessions, ask every round through the `question` tool, batching the whole frontier into one call.

          Inside Herdr (`HERDR_ENV=1`), transfer each new worktree to a new agent before you change any file. Temporary worktrees that you remove in the same run stay with you.

          1. `herdr worktree open --cwd <main checkout> --path <worktree> --no-focus`; read `.result.root_pane.pane_id`.
          2. `herdr agent start <slug> --kind codex --pane <pane id>`, with `<slug>` matching `[a-z][a-z0-9_-]{0,31}`.
          3. `herdr agent prompt <slug> "<brief>"`, with the user's request verbatim, the base branch, and your decisions so far.
          4. When `herdr agent wait <slug> --until working --timeout 30000` succeeds, give the user the agent name and end your turn. When a step fails, continue in the worktree yourself.
        '';
        settings.features.hooks = true;
        # A store-path string lets Home Manager read the plugin name and version from its manifest.
        plugins = [ "${pkgs.ponytail.src}" ];
      };
    };
}
