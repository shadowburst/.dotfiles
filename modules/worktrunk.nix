_: {
  flake.homeModules.cli =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    {
      programs.worktrunk = {
        enable = true;
        settings = {
          # The herdr worktree plugin opens each worktree as a herdr Space.
          worktree-path = "~/.herdr/worktrees/{{ repo }}/{{ branch | sanitize }}";
          commit.generation.command = lib.getExe config.textGeneration.package;
        };
        # Skills, activity markers, and Claude Code worktrees through wt.
        claudeCodeIntegration = {
          enable = true;
          configurationSkill = true;
          statusLine = false;
        };
      };

      # Skills and activity markers. The version matches the wt binary.
      programs.codex.plugins = [ "${pkgs.worktrunk.src}/plugins/worktrunk" ];
    };
}
