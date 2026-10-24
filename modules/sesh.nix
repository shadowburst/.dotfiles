_: {
  flake.homeModules.cli =
    { ... }:
    {
      programs.sesh = {
        enable = true;
        enableAlias = false;
        enableTmuxIntegration = false;
        settings = {
          git_namer_use_worktree_root = true;
          default_session = {
            startup_command = "$AGENT";
            preview_command = "tree -a -L 1 -C --dirsfirst --sort=name --noreport {}";
          };
          # shortcut: sesh 2.33 ignores default_session.windows at startup; use a wildcard until fixed.
          wildcard = [
            {
              pattern = "/**";
              windows = [ "editor" ];
            }
          ];
          window = [
            {
              name = "editor";
              startup_script = "$EDITOR";
            }
          ];
        };
      };
    };
}
